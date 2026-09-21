import mongoose from "mongoose";

const PatientNoteSchema = new mongoose.Schema({
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true, maxlength: 500 },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export const PatientNoteModel = mongoose.model('PatientNote', PatientNoteSchema);

export const createNote = (values: Record<string, any>) =>
    new PatientNoteModel(values).save().then((note) => note.toObject());

export const getNotesForDoctor = (doctorId: mongoose.Types.ObjectId, patientId?: string) => {
    const filter: Record<string, any> = { doctorId };
    if (patientId) filter.patientId = patientId;
    return PatientNoteModel.find(filter)
        .populate('patientId', '_id username')
        .sort({ createdAt: -1 });
};

export const getAllNotes = (patientId?: string) => {
    const filter: Record<string, any> = {};
    if (patientId) filter.patientId = patientId;
    return PatientNoteModel.find(filter)
        .populate('patientId', '_id username')
        .sort({ createdAt: -1 });
};

export const getUnreadCounts = async (doctorId: mongoose.Types.ObjectId) => {
    const counts = await PatientNoteModel.aggregate([
        { $match: { doctorId, read: false } },
        { $group: { _id: "$patientId", count: { $sum: 1 } } }
    ]);
    const map: Record<string, number> = {};
    counts.forEach((c) => { map[c._id.toString()] = c.count; });
    return map;
};

export const getAllUnreadCounts = async () => {
    const counts = await PatientNoteModel.aggregate([
        { $match: { read: false } },
        { $group: { _id: "$patientId", count: { $sum: 1 } } }
    ]);
    const map: Record<string, number> = {};
    counts.forEach((c) => { map[c._id.toString()] = c.count; });
    return map;
};

export const markNotesAsRead = (doctorId: mongoose.Types.ObjectId, patientId: mongoose.Types.ObjectId) =>
    PatientNoteModel.updateMany(
        { doctorId, patientId, read: false },
        { $set: { read: true } }
    );

export const markAllNotesAsRead = (patientId: mongoose.Types.ObjectId) =>
    PatientNoteModel.updateMany(
        { patientId, read: false },
        { $set: { read: true } }
    );

export const markSingleNoteAsRead = (noteId: mongoose.Types.ObjectId) =>
    PatientNoteModel.findByIdAndUpdate(noteId, { $set: { read: true } });
