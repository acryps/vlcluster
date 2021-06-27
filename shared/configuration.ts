import { existsSync, readFileSync, writeFileSync } from "fs";
import { ClientConfiguration } from "../client/configuration";
import { GatewayConfiguration } from "../gateway/configuration";
import { RegistryConfiguration } from "../registry/configuration";
import { WorkerConfiguration } from "../worker/configuration";
import { Cluster } from "./cluster";

export class Configuration {
    static activeCluster: string;

    static registry?: RegistryConfiguration;
    static gateways: GatewayConfiguration[] = [];
    static workers: WorkerConfiguration[] = [];
    static clients: ClientConfiguration[] = [];

    static save() {
        console.log("SAVE CONFIG");

        if (this.registry) {
            writeFileSync(Cluster.registryConfiguration, JSON.stringify(this.registry));
        }

        for (let gateway of this.gateways) {
            writeFileSync(Cluster.gatewayConfiguration(gateway.name), JSON.stringify(gateway));
        }

        for (let worker of this.workers) {
            writeFileSync(Cluster.workerConfiguration(worker.name), JSON.stringify(worker));
        }

        for (let client of this.clients) {
            writeFileSync(Cluster.gatewayConfiguration(client.name), JSON.stringify(client));
        }

        writeFileSync(Cluster.configurationFileLocation, JSON.stringify({
            registry: !!this.registry,
            gateways: this.gateways.map(c => c.name),
            workers: this.workers.map(c => c.name),
            clients: this.clients.map(c => c.name)
        }));
    }

    static load() {
        if (existsSync(Cluster.configurationFileLocation)) {
            const config = JSON.parse(readFileSync(Cluster.configurationFileLocation).toString());

            if (config.registry) {
                this.registry = JSON.parse(readFileSync(Cluster.registryConfiguration).toString());
            }

            for (let gateway of config.gateways) {
                this.gateways.push(JSON.parse(readFileSync(Cluster.gatewayConfiguration(gateway)).toString()));
            }

            for (let worker of config.workers) {
                this.workers.push(JSON.parse(readFileSync(Cluster.workerConfiguration(worker)).toString()));
            }

            for (let client of config.clients) {
                this.clients.push(JSON.parse(readFileSync(Cluster.clientConfiguration(client)).toString()));
            }
        }
    }
}