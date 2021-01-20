export class WorkerInstance {
    application: string;
    env: string;
    version: string;
    instanceId: string;
    internalPort: number;
    externalPort: number;
    running: boolean;
}