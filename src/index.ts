import compression from 'compression'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import http from 'http'
import mongoose from 'mongoose'
import router from './router'

const app = express()

app.use(cors({
    credentials: true,
}))

app.use(express.json())
app.use(cookieParser())
app.use(compression())

const server = http.createServer(app)

server.listen(8989, () => {
    console.log('Server is running on http://localhost:8989')
})

const dbURI = process.env.MONGODB_URL;
mongoose.Promise = Promise;
mongoose.connect(dbURI)
// mongoose.connect("mongodb://localhost:27017")
mongoose.connection.on('error', (err: Error) => {
    console.log(err)
})

app.use('/', router());