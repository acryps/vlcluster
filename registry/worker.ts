import { WorkerInstance } from "../worker/instance-state";
import { QueueMessage } from "./messages/base";

export class ActiveWorker {
    pendingMessages: QueueMessage[] = [];

    name: string;
	lastSeen: Date;
	cpuUsage: number;
	endpoint: string;

	instances: ActiveInstance[] = [];
}

export class ActiveInstance {
	id: string;
	application: string;
	version: string;
	env: string;
	port: number;

	worker: ActiveWorker;
}