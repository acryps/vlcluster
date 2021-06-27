import { existsSync, readFileSync, writeFileSync } from "fs";
import { ClientConfiguration } from "../client/configuration";
import { GatewayConfiguration } from "../gateway/configuration";
import { RegistryConfiguration } from "../registry/configuration";
import { WorkerConfiguration } from "../worker/configuration";
import { Cluster } from "./cluster";

export class Configuration {
    static activeCluster: string;

    static registry?: RegistryConfiguration;
    static gateways: GatewayConfiguration[];
    static workers: WorkerConfiguration[];
    static clients: ClientConfiguration[];

    static save() {
        console.log("SAVE CONFIG");

        writeFileSync(Cluster.configurationFileLocation, JSON.stringify({
            registry: this.registry,
            gateways: this.gateways,
            workers: this.workers,
            clients: this.clients
        }));
    }

    static load() {
        if (existsSync(Cluster.configurationFileLocation)) {
            const config = JSON.parse(readFileSync(Cluster.configurationFileLocation).toString());

            this.registry = config.registry;
            this.gateways = config.gateways;
            this.workers = config.workers;
            this.clients = config.clients;

            return;
        }

        this.gateways = [];
        this.workers = [];
        this.clients = [];
    }
}