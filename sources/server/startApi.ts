import express from 'express';
import bodyParser from 'body-parser';
import { Controller } from '../controller/controller';

export async function startApi(controller: Controller) {
    const app = express();
    app.use(bodyParser.json());
    app.get("/", (req, res) => { res.send("Welcome to Home CNC!"); });
    app.get('/controller/discover', (req, res) => {
        res.send({ devices: controller.availableDevices });
    });
    app.post('/controller/connect', (req, res) => {
        controller.connect(req.body.id as string, req.body.profile as string);
        res.send({ ok: true });
    });
    app.post('/controller/disconnect', (req, res) => {
        controller.disconnect(req.body.id as string);
        res.send({ ok: true });
    });
    app.get('/machines', (req, res) => {
        res.send({ ok: true });
    });
    app.listen(3000);
}