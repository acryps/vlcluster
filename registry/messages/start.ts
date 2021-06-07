import { QueueMessage } from "./base";

export class StartRequest extends QueueMessage {
    application: string;
    version: string;
    env: string;
    instance: string;
    variables: {};
    port: number;
    backupOf: string;

    oncomplete(status: StartRequest) {}
}