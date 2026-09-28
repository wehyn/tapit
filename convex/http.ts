import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { upload } from "./profileImageUploadHttp";
import { upload as uploadMedia, uploadAdmin as uploadAdminMedia } from "./profileMediaUploadHttp";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/profile-image-upload", method: "POST", handler: upload });
http.route({ path: "/profile-image-upload", method: "OPTIONS", handler: upload });
http.route({ path: "/profile-media-upload", method: "POST", handler: uploadMedia });
http.route({ path: "/profile-media-upload", method: "OPTIONS", handler: uploadMedia });
http.route({ path: "/admin-profile-media-upload", method: "POST", handler: uploadAdminMedia });
http.route({ path: "/admin-profile-media-upload", method: "OPTIONS", handler: uploadAdminMedia });

export default http;
