import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Controller } from '../controller/controller';

export async function startApi(controller: Controller) {
    const app = express();
    app.use(bodyParser.json());
    app.use(cors());
    app.get("/", (req, res) => { res.send("Welcome to Home CNC!"); });
    app.get('/controller/discover', (req, res) => {
        res.send({ devices: controller.availableDevices });
    });
    app.post('/controller/connect', (req, res) => {
        controller.connect(req.body.id as string, req.body.profile as string);
        res.send(controller.state);
    });
    app.post('/controller/disconnect', (req, res) => {
        controller.disconnect(req.body.id as string);
        res.send(controller.state);
    });
    app.get('/controller/state', (req, res) => {
        res.send(controller.state);
    });
    app.post('/controller/command', (req, res) => {
        controller.machine(req.body.machine as string)!.command(req.body.id as string, { kind: 'gcode', command: req.body.command as string });
        res.send(controller.state);
    });
    app.listen(3000);
}