import dotenv from 'dotenv';
import { validateEnv } from '@wa-chat/config';

dotenv.config();
validateEnv(process.env);

export const workerName = 'wa-chat-worker';
