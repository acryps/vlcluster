import { WorkerInstance } from "../worker/instance-state";
import { QueueMessage } from "./messages/base";

export class ChildWorker {
    messageQueue: QueueMessage[] = [];

    name: string;
	lastSeen: Date;
	cpuUsage: number;
	up: boolean;
	endpoint: string;

	instances: { [key: string]: ChildInstance } = {};
}

export class ChildInstance {
	id: string;
	application: string;
	version: string;
	env: string;
	port: number;

	worker: ChildWorker;
}