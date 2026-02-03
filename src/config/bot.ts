import { webBtnGen, payloadBtnGen } from "simple-messenger-blocks";
import { quickReplyBtn } from "utils/generators/quick-reply-btn";

let botConfig = {
  //Get started texts
  defaultGreeting:
    "This chatbot provides study materials for Textile Education(mainly BUTEX)😀, moreover you can casually chat with it in both Bangla & English",
  enGreeting:
    "This chatbot provides study materials for Textile Education(mainly BUTEX)😀, moreover you can casually chat with it in both Bangla & English",

  //Persistent Menu Buttons
  persistentMenuButtons: [
    webBtnGen(
      "NoteBot App 📱",
      "https://play.google.com/store/apps/details?id=com.hawkers.notebot"
    ),
    payloadBtnGen("Help 😥", "help_payload"),
    payloadBtnGen("Donate 💰", "donation_payload"),
    webBtnGen("Founder 🧑", "https://triptex.me/"),
    webBtnGen("Submit Notes 📙", "https://goo.gl/forms/akfj9X8vxuoj2xQg2"),
    webBtnGen("NoteBOT Web 🌍", "https://notebot.netlify.app/#/"),
  ],

  //welcome message
  getStartedText:
    "Hello 😄, Welcome to the new BUTEX NoteBOT powered by বন্দি পাঠশালা",
  getStartedButtons: [
    quickReplyBtn("Usage🤔", "help_flow"),
    quickReplyBtn("Notes📗", "notes_flow"),
    quickReplyBtn("Question Bank🧾", "qb_flow"),
    quickReplyBtn("Routine📅", "routine_flow"),
    quickReplyBtn("Results📊", "result_flow"),
    quickReplyBtn("Lab Reports🧪", "reports_flow"),
  ],
};

module.exports = {
  defaultGreeting: botConfig.defaultGreeting,
  enGreeting: botConfig.enGreeting,
  persistentMenuButtons: botConfig.persistentMenuButtons,
  getStartedText: botConfig.getStartedText,
  getStartedButtons: botConfig.getStartedButtons,
};
