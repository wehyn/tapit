import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { upload } from "./profileImageUploadHttp";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/profile-image-upload", method: "POST", handler: upload });
http.route({ path: "/profile-image-upload", method: "OPTIONS", handler: upload });

export default http;
