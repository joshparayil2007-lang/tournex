const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('./models/User');

async function run() {
    let mongoServer;
    try {
        console.log("Starting MMS...");
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        console.log("Connecting to", uri);
        await mongoose.connect(uri, { dbName: 'tournex' });
        console.log("Connected to", uri, "readyState:", mongoose.connection.readyState);
        
        console.log("Creating user...");
        await User.create({
            id: 'u_123',
            username: 'testu',
            email: 'test@g.com',
            password_hash: '123'
        });
        console.log("User created");
        
        const u = await User.findOne({ username: 'testu' });
        console.log("Found user:", u.username);
        
        await mongoose.disconnect();
        await mongoServer.stop();
        console.log("SUCCESS");
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
