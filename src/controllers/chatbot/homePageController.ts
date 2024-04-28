import { Request, Response } from "express";


export const getHomepage = (req: Request, res: Response) => {
    return res.render("homepage.ejs");
};

export const getFacebookUserProfile = (req: Request, res: Response) => {
    return res.render("profile.ejs");
}


export default {
    getHomepage,
    getFacebookUserProfile
}
