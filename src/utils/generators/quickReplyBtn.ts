import { lengthValidator } from "utils/validators/lengthValidator"

export const quickReplyBtn = (title: string, payload: any) => {
    return {
        "content_type": "text",
        "title":  lengthValidator(title, 15),
        "payload": payload
    }
}



