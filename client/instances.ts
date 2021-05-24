import { Client } from "./client";
import * as fetch from "node-fetch";
import { Logger } from "../log";
import { Cluster } from "../cluster";

export class InstancesClient {
    logger = new Logger("instances");

    constructor(public client: Client) {}

    async list(application: string, env: string) {
        let instances = await fetch(`http://${this.client.host}:${Cluster.port}${Cluster.api.registry.instances.list}`, {
            method: "POST",
            headers: {
                ...this.client.authHeaders
            }
        }).then(r => r.json());

        console.log(instances);

        if (application && application != "*") {
            instances = instances.filter(i => i.application == application);
        }

        if (env && env != "*") {
            instances = instances.filter(i => i.env == env);
        }

        return instances;
    }
}