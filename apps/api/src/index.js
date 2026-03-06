import express from 'express';
import dotenv from 'dotenv';
import { validateEnv } from '@wa-chat/config';
dotenv.config();
const env = validateEnv(process.env);
const app = express();
app.use(express.json());
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
const port = Number(env.PORT);
if (!Number.isFinite(port)) {
    throw new Error(`PORT must be a number, received "${env.PORT}"`);
}
app.listen(port, () => {
    console.log(`API listening on ${port}`);
});
//# sourceMappingURL=index.js.map