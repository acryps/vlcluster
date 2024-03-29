import { copyFile, existsSync, mkdirSync, readFile, readFileSync, writeFileSync } from "fs";
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

    static loadedRegistryConfiguration: string;

    static save() {
        let config: StoredConfiguration;

        if (!existsSync(Cluster.rootDirectory)) {
            mkdirSync(Cluster.rootDirectory);
        }
        
        if (existsSync(Cluster.configurationFileLocation)) {
            config = JSON.parse(readFileSync(Cluster.configurationFileLocation).toString());
        } else {
            config = {
                registry: false,
                gateways: [],
                workers: [],
                clients: []
            }
        }

        if (this.registry) {
            if (!existsSync(Cluster.registryConfiguration) || (this.loadedRegistryConfiguration == readFileSync(Cluster.registryConfiguration).toString())) {
                const serialized = JSON.stringify(this.registry);

                writeFileSync(Cluster.registryConfiguration, serialized);

                this.loadedRegistryConfiguration = serialized;
            }
        }

        for (let gateway of this.gateways) {
            writeFileSync(Cluster.gatewayConfiguration(gateway.name), JSON.stringify(gateway));
        }

        for (let worker of this.workers) {
            writeFileSync(Cluster.workerConfiguration(worker.name), JSON.stringify(worker));
        }

        for (let client of this.clients) {
            writeFileSync(Cluster.clientConfiguration(client.name), JSON.stringify(client));
        }

        writeFileSync(Cluster.configurationFileLocation, JSON.stringify({
            registry: !!this.registry || config.registry,
            gateways: [...config.gateways, ...this.gateways.map(c => c.name)].filter((c, i, a) => a.indexOf(c) == i),
            workers: [...config.workers, ...this.workers.map(c => c.name)].filter((c, i, a) => a.indexOf(c) == i),
            clients: [...config.clients, ...this.clients.map(c => c.name)].filter((c, i, a) => a.indexOf(c) == i)
        }));

        if (this.activeCluster || !existsSync(Cluster.activeClusterFileLocation)) {
            writeFileSync(Cluster.activeClusterFileLocation, JSON.stringify(this.activeCluster || null));
        }
    }

    static load() {
        if (existsSync(Cluster.configurationFileLocation)) {
            const config = JSON.parse(readFileSync(Cluster.configurationFileLocation).toString());

            if (config.registry) {
                const config = readFileSync(Cluster.registryConfiguration).toString();
                this.loadedRegistryConfiguration = config;

                this.registry = JSON.parse(config);
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

        if (existsSync(Cluster.activeClusterFileLocation)) {
            this.activeCluster = JSON.parse(readFileSync(Cluster.activeClusterFileLocation).toString());
        }
    }
}

export class StoredConfiguration {
    registry: boolean;
    gateways: string[];
    workers: string[];
    clients: string[];
}