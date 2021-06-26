import { Application } from "../shared/models/application";
import { Client } from "../shared/models/client";
import { Gateway } from "../shared/models/gateway";
import { Variable } from "../shared/models/variable";
import { Worker } from "../shared/models/worker";

export class RegistryConfiguration {
    name: string;
    key: string;

    workers: Worker[];
    clients: Client[];
    gateways: Gateway[];

    applications: Application[];
    variables: Variable[];
}