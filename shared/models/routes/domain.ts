import { Environnement } from "../environnement";
import { SSLRoute } from "./ssl";
import { WebSocketRoute } from "./websocket";

export class DomainRoute {
    host: string;
    port: number;

    webSockets: WebSocketRoute[];
    ssl?: SSLRoute;
}