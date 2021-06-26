import { Environnement } from "./environnement";
import { Instance } from "./instance";
import { Version } from "./version";

export class Application {
    name: string;

    versions: Version[];

    environnements: Environnement[];

    instances: Instance[];
}