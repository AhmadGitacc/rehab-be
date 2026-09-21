import 'dotenv/config';
import mongoose from 'mongoose';
import { UserModel } from './src/models/User';

const t = (label: string, proj: any) =>
    UserModel.collection.find({ role: 'patient' }, { projection: proj }).toArray()
        .then((r) => console.log(label, '=> OK', r.length))
        .catch((e: any) => console.log(label, '=> FAIL', e?.message?.split('\n')[0]));

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL!);
    console.log('connected');

    await t('P1 auth:0 only', { authentication: 0 });
    await t('P2 auth:0 + subfields:0', { authentication: 0, 'authentication.password': 0, 'authentication.salt': 0, 'authentication.sessionToken': 0 });
    await t('P3 subfields:0 only', { 'authentication.password': 0, 'authentication.salt': 0, 'authentication.sessionToken': 0 });
    await t('P4 auth.pw:0 only', { 'authentication.password': 0 });

    await mongoose.disconnect();
    process.exit(0);
};
run();