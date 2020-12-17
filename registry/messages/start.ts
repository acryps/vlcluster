import { QueueMessage } from "./base";

export class StartRequest extends QueueMessage {
    application: string;
    version: string;
    env: string;
    instance: string;

    port: number;

    oncomplete(status: StartRequest) {}
}