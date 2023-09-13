import { Discovery } from "../connectors/Discovery";

export class Controller {
    discovery: Discovery;
    constructor(discovery: Discovery) {
        this.discovery = discovery;
    }
}