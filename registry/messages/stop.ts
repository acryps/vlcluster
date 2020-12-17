import { QueueMessage } from "./base";

export class StopRequest extends QueueMessage {
    instance: string;

    oncomplete() {}
}