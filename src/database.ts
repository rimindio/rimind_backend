import { createClient } from "gel";
import dbschema from "../dbschema/edgeql-js";

export const client = createClient();
export { dbschema };
