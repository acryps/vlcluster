import { DomainRoute } from "./routes/domain";
import { Version } from "./version";

export class Environnement {
    name: string;

    latestVersion?: Version;

    routes: DomainRoute[];
}