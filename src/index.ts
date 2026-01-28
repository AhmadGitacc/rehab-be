import compression from 'compression'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import router from './router'

const app = express()

app.use(cors({
    origin: ["http://localhost:5173", "https://your-frontend.vercel.app"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json())
app.use(cookieParser())
app.use(compression())

let isConnected: mongoose.ConnectionStates = 0;

const connectDB = async () => {
    // 0 is 'disconnected'
    if (isConnected === 1) return;

    try {
        const db = await mongoose.connect(process.env.MONGODB_URL!);
        isConnected = db.connections[0].readyState;
        console.log("MongoDB Connected");
    } catch (err) {
        console.error("DB Connection Error:", err);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

app.use('/', router());

app.get('/status', (req, res) => {
    const statusText = isConnected === 1 ? 'ONLINE' : 'OFFLINE';
    const statusColor = isConnected === 1 ? '#2ecc71' : '#e74c3c';

    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>API Status</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    background-color: #f4f7f9;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 24px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.05);
                    text-align: center;
                    width: 85%;
                    max-width: 400px;
                }
                .indicator {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    display: inline-block;
                    background-color: ${statusColor};
                    margin-right: 8px;
                    box-shadow: 0 0 8px ${statusColor};
                }
                h1 { font-size: 1.5rem; color: #333; margin-bottom: 8px; }
                p { color: #666; font-size: 1rem; }
                .badge {
                    display: inline-block;
                    padding: 6px 16px;
                    border-radius: 50px;
                    background: #f0f0f0;
                    font-weight: 600;
                    font-size: 0.8rem;
                    color: #444;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Server Status</h1>
                <p><span class="indicator"></span> Database is <strong>${statusText}</strong></p>
                <div class="badge">Vercel Serverless Mode</div>
            </div>
        </body>
        </html>
    `);
});

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(8989, () => console.log('Server running on http://localhost:8989'));
}

// const server = http.createServer(app)

// server.listen(8989, () => {
//     console.log('Server is running on http://localhost:8989')
// })

// const dbURI = process.env.MONGODB_URL;
// mongoose.Promise = Promise;
// mongoose.connect(dbURI)
// // mongoose.connect("mongodb://localhost:27017")
// mongoose.connection.on('error', (err: Error) => {
//     console.log(err)
// })

// app.use('/', router());