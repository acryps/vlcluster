import { Environnement } from "./environnement";
import { Version } from "./version";
import { Worker } from "./worker";

export class Instance {
    name: string;
    version: Version;
    env: Environnement;
    worker: Worker;
    port?: number;
    running: boolean;
    backupOf: Instance;
}