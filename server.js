const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');

const User = require('./models/User');
const Tournament = require('./models/Tournament');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-tournex-key-123';

let memoryServer;

async function connectDB() {
    let uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tournex';
    
    // Fallback to in-memory server if local MongoDB is not running
    if (uri.includes('127.0.0.1') && process.env.NODE_ENV !== 'production') {
        try {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            memoryServer = await MongoMemoryServer.create();
            uri = memoryServer.getUri();
            console.log('Using in-memory MongoDB for local development');
        } catch (e) {
            console.warn('Could not start in-memory MongoDB, relying on process.env.MONGODB_URI');
        }
    }
    
    try {
        mongoose.connection.on('disconnected', () => console.log('Mongoose disconnected'));
        mongoose.connection.on('error', err => console.log('Mongoose error', err));
        
        await mongoose.connect(uri, { dbName: 'tournex' });
        console.log('Connected to MongoDB at', uri);
        console.log('Connection readyState:', mongoose.connection.readyState);
    } catch (err) {
        console.error('MongoDB connection error:', err);
    }
}

connectDB();

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// --- Auth Routes ---
app.post('/api/register', async (req, res) => {
    console.log("Register route hit. Mongoose base readyState:", mongoose.connection.readyState, "User db readyState:", User.db.readyState);
    const { username, email, password } = req.body;
    try {
        const password_hash = await bcrypt.hash(password, 10);
        const id = 'u_' + Date.now();
        const created_at = Date.now();
        
        try {
            const newUser = await User.create({ id, username, email, password_hash, created_at });
            const token = jwt.sign({ id, username, email }, JWT_SECRET, { expiresIn: '24h' });
            res.status(201).json({ token, user: { id, username, email } });
        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({ error: 'Username or email already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Incorrect email or password' });
        
        if (await bcrypt.compare(password, user.password_hash)) {
            const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
        } else {
            res.status(400).json({ error: 'Incorrect email or password' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ id: req.user.id }, 'id username email created_at');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/me', authenticateToken, async (req, res) => {
    const { username, email, oldpw, newpw } = req.body;
    
    try {
        const user = await User.findOne({ id: req.user.id });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        let new_hash = user.password_hash;
        if (newpw) {
            if (!oldpw || !(await bcrypt.compare(oldpw, user.password_hash))) {
                return res.status(400).json({ error: 'Current password incorrect' });
            }
            new_hash = await bcrypt.hash(newpw, 10);
        }
        
        user.username = username;
        user.email = email;
        user.password_hash = new_hash;
        
        try {
            await user.save();
            const token = jwt.sign({ id: user.id, username, email }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ token, user: { id: user.id, username, email } });
        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({ error: 'Username or email already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Tournament Routes ---
function formatTournament(doc) {
    return {
        id: doc.id,
        uid: doc.uid,
        name: doc.name,
        fmt: doc.fmt,
        leagueRounds: doc.leagueRounds,
        groupQualifiers: doc.groupQualifiers,
        groupSize: doc.groupSize,
        players: doc.players,
        fix: doc.fix,
        goals: doc.goals,
        conceded: doc.conceded,
        status: doc.status,
        champion: doc.champion,
        created: doc.created_at
    };
}

app.get('/api/tournaments', authenticateToken, async (req, res) => {
    try {
        const toursDocs = await Tournament.find({ uid: req.user.id }).sort({ created_at: -1 });
        const tours = {};
        toursDocs.forEach(doc => {
            tours[doc.id] = formatTournament(doc);
        });
        res.json(tours);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/tournaments', authenticateToken, async (req, res) => {
    const tour = req.body;
    try {
        await Tournament.create({
            id: tour.id,
            uid: req.user.id,
            name: tour.name,
            fmt: tour.fmt,
            leagueRounds: tour.leagueRounds || null,
            groupQualifiers: tour.groupQualifiers || null,
            groupSize: tour.groupSize || null,
            players: tour.players,
            fix: tour.fix,
            goals: tour.goals,
            conceded: tour.conceded,
            status: tour.status,
            champion: tour.champion || null,
            created_at: tour.created
        });
        res.status(201).json({ message: 'Tournament created' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/tournaments/:id', authenticateToken, async (req, res) => {
    const tour = req.body;
    const { id } = req.params;
    
    try {
        const result = await Tournament.updateOne(
            { id, uid: req.user.id },
            {
                name: tour.name,
                fmt: tour.fmt,
                leagueRounds: tour.leagueRounds || null,
                groupQualifiers: tour.groupQualifiers || null,
                groupSize: tour.groupSize || null,
                players: tour.players,
                fix: tour.fix,
                goals: tour.goals,
                conceded: tour.conceded,
                status: tour.status,
                champion: tour.champion || null
            }
        );
        if (result.matchedCount === 0) return res.status(404).json({ error: 'Tournament not found or not authorized' });
        res.json({ message: 'Tournament updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/tournaments/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await Tournament.deleteOne({ id, uid: req.user.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Tournament not found or not authorized' });
        res.json({ message: 'Tournament deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server running on http://localhost:' + PORT);
});
