import { QueueMessage } from "./messages/base";

export class ChildWorker {
    messageQueue: QueueMessage[] = [];

    name: string;
	lastSeen: Date;
	cpuUsage: number;
	up: boolean;
}