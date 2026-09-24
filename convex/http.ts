import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { upload } from "./profileImageUploadHttp";
import { upload as uploadMedia } from "./profileMediaUploadHttp";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/profile-image-upload", method: "POST", handler: upload });
http.route({ path: "/profile-image-upload", method: "OPTIONS", handler: upload });
http.route({ path: "/profile-media-upload", method: "POST", handler: uploadMedia });
http.route({ path: "/profile-media-upload", method: "OPTIONS", handler: uploadMedia });

export default http;
