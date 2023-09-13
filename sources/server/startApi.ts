import express from 'express';
import { Controller } from '../controller/controller';

export async function startApi(controller: Controller) {
    const app = express();
    app.get("/", (req, res) => { res.send("Welcome to Home CNC!"); });
    app.get('/discover', (req, res) => { res.send({ devices: controller.discovery.devices }); });
    app.listen(3000);
}