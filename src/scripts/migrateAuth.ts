/**
 * One-off migration task. Run BEFORE deploying the unique email index:
 *   npx ts-node src/scripts/migrateAuth.ts            # dry run (default)
 *   npx ts-node src/scripts/migrateAuth.ts --apply    # perform changes
 *
 * 1. Detects/merges duplicate emails (case- and whitespace-insensitive).
 * 2. Backfills auth fields on existing documents so nobody is locked out.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { UserModel } from '../models/User';
import { EmailOtpModel } from '../models/EmailOtp';
import { PasswordResetTokenModel } from '../models/PasswordResetToken';
import { RefreshSessionModel } from '../models/RefreshSession';
import { GameSessionModel } from '../models/GameSession';
import { PatientNoteModel } from '../models/PatientNote';

const APPLY = process.argv.includes('--apply');

const main = async () => {
    if (!process.env.MONGODB_URL) throw new Error('MONGODB_URL is not set');
    await mongoose.connect(process.env.MONGODB_URL);

    const duplicates = await UserModel.aggregate<{ _id: string; ids: mongoose.Types.ObjectId[]; count: number }>([
        {$group: {_id: {$toLower: {$trim: {input: '$email'}}}, ids: {$push: '$_id'}, count: {$sum: 1}}},
        {$match: {count: {$gt: 1}}},
    ]);

    console.log(`[migrate] duplicate email groups: ${duplicates.length}`);

    if (APPLY) {
        for (const group of duplicates) {
            // Oldest ObjectId wins; reassign every known reference before deleting.
            const sorted = [...group.ids].sort((a, b) => a.getTimestamp().getTime() - b.getTimestamp().getTime());
            const [keeper, ...removed] = sorted;
            const removedIds = removed as mongoose.Types.ObjectId[];
            const affectedCaregivers = await UserModel.find({linkedPatientIds: {$in: removedIds}}).select('_id');

            await Promise.all([
                GameSessionModel.updateMany({userId: {$in: removedIds}}, {userId: keeper}),
                PatientNoteModel.updateMany({patientId: {$in: removedIds}}, {patientId: keeper}),
                PatientNoteModel.updateMany({doctorId: {$in: removedIds}}, {doctorId: keeper}),
                UserModel.updateMany({assignedDoctorId: {$in: removedIds}}, {assignedDoctorId: keeper}),
                UserModel.updateMany({linkedPatientIds: {$in: removedIds}}, {$pull: {linkedPatientIds: {$in: removedIds}}}),
                UserModel.updateMany(
                    {_id: {$in: affectedCaregivers.map((c) => c._id)}},
                    {$addToSet: {linkedPatientIds: keeper}},
                ),
                EmailOtpModel.updateMany({userId: {$in: removedIds}}, {userId: keeper}),
                PasswordResetTokenModel.updateMany({userId: {$in: removedIds}}, {userId: keeper}),
                RefreshSessionModel.updateMany({userId: {$in: removedIds}}, {userId: keeper}),
            ]);

            await UserModel.deleteMany({_id: {$in: removedIds}});
            console.log(`[migrate] merged ${group._id}: kept ${keeper}, removed ${removedIds.join(', ')}`);
        }

        const backfill = await UserModel.updateMany(
            {emailVerified: {$exists: false}},
            {$set: {emailVerified: true, authVersion: 0, loginAttempts: 0, loginLockedUntil: null}},
        );
        console.log(`[migrate] backfilled ${backfill.modifiedCount} existing users as email-verified`);
    } else {
        for (const group of duplicates) console.log(`  ${group._id}: ${group.ids.join(', ')}`);
        console.log('[migrate] dry run only — pass --apply to perform changes');
    }

    await mongoose.disconnect();
};

main().catch((err) => {
    console.error('[migrate] failed:', err);
    process.exitCode = 1;
});
