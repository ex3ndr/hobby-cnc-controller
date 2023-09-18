import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Manager } from './manager';
import * as z from 'zod';

const manageCreateSchema = z.object({
    profile: z.string(),
    transport: z.union([z.object({
        type: z.literal('serial'),
    }), z.object({
        type: z.literal('tcp'),
        host: z.string(),
        port: z.number(),
    })])
});

const idRequestSchema = z.object({
    id: z.string()
});

const gcodeRequestSchema = z.object({
    id: z.string(),
    command: z.string()
});

export async function startApi(manager: Manager) {
    const app = express();
    app.use(bodyParser.json());
    app.use(cors());
    app.get("/", (req, res) => { res.send("Welcome to Home CNC!"); });

    //
    // Manage
    //

    app.get('/manage/discover', (req, res) => {
        res.send({ devices: manager.discoveredDevices });
    });
    app.post('/manage/create', async (req, res) => {
        let parsed = manageCreateSchema.parse(req.body);
        await manager.create(parsed.profile, parsed.transport);
        res.send(await manager.state());
    });
    app.post('/manage/delete', async (req, res) => {
        await manager.delete();
        res.send(await manager.state());
    });

    //
    // Controller
    //

    app.get('/controller/state', async (req, res) => {
        res.send(await manager.state());
    });
    app.post('/controller/command', async (req, res) => {
        let parsed = gcodeRequestSchema.parse(req.body);
        manager.activeController?.command(parsed.id, { kind: 'gcode', command: parsed.command });
        res.send(await manager.state());
    });
    app.post('/controller/unlock', async (req, res) => {
        let parsed = idRequestSchema.parse(req.body);
        manager.activeController?.command(parsed.id, { kind: 'soft-unlock' });
        res.send(await manager.state());
    });
    app.post('/controller/lock', async (req, res) => {
        let parsed = idRequestSchema.parse(req.body);
        manager.activeController?.command(parsed.id, { kind: 'soft-lock' });
        res.send(await manager.state());
    });
    app.post('/controller/reset', async (req, res) => {
        let parsed = idRequestSchema.parse(req.body);
        manager.activeController?.command(parsed.id, { kind: 'reset' });
        res.send(await manager.state());
    });
    app.listen(3000);
}