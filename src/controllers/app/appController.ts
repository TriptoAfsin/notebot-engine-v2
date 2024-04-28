import { Request, Response } from "express";
import { appIntoService } from "services/app/appService";

export const appIntro = async (req: Request, res: Response) => {
   const introRes = await appIntoService();

    return res.send(introRes);
};

export default {
    appIntro
};

