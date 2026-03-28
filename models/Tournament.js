const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    uid: { type: String, required: true }, // References User.id but kept as String for simplicity since we use UUIDs
    name: { type: String, required: true },
    fmt: { type: String, required: true },
    leagueRounds: { type: Number, default: null },
    groupQualifiers: { type: Number, default: null },
    groupSize: { type: Number, default: null },
    players: { type: Array, required: true },
    fix: { type: Array, required: true },
    goals: { type: Array, required: true },
    conceded: { type: Array, required: true },
    status: { type: String, required: true },
    champion: { type: String, default: null },
    created_at: { type: Number, default: Date.now }
});

module.exports = mongoose.model('Tournament', tournamentSchema);
