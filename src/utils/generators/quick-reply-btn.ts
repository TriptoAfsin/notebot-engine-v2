import { lengthValidator } from "utils/validators/length-validator"

export const quickReplyBtn = (title: string, payload: any) => {
    return {
        "content_type": "text",
        "title":  lengthValidator(title, 15),
        "payload": payload
    }
}



