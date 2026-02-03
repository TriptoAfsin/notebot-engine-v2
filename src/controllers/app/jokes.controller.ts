import { Request, Response } from "express";

const jokes: string[] = [
  // Original v1 jokes
  `Mom: Anton, do you think I'm a bad mother?\n\nSon: Mom, My name is Paul.`,
  `Women really know how to hold a grudge. My wife asked me to pass her a lip balm. And by mistake, I gave her a tube of Super Glue. It's been a month now and she's still not speaking to me!`,
  `Give a man a gun and he will rob a bank.\n\nGive a man a bank and he will rob everyone.`,
  `What is the difference between a snow man and a snow woman?-\n\n"Snowballs."`,
  `Of course I should clean my windows. But privacy is important too.`,
  `My girlfriend accused me of cheating. I told her she was starting to sound like my wife.`,
  `Two men were talking about their wives\n\nThe first man says "My wife is an angel." The second man says "You're lucky, mine's still alive."`,
  `When you send nudes to your roblox gf and your uncle's phone sounds with a text tone…`,
  `I hate 2 faced people because I don't know which face to slap first.`,
  `I wasn't planning on going for a run today, but those cops came out of nowhere`,
  `Wife: "I look fat. Can you give me a compliment?" Husband: "You have perfect eyesight."`,
  `Doctor: Hello, did you come to see me with an eye problem?\n\nPatient: Wow, yes, how can you tell?\n\nDoctor: Because you came in through the window instead of the door.`,
  `I can't believe I forgot to go to the gym today. That's 7 years in a row now.`,
  `Why is women's soccer so rare?\n\n-It's quite hard to find enough women willing to wear the same outfit.`,
  `I'm selling my talking parrot. Why? Because yesterday, the bastard tried to sell me.`,
  `What is dangerous?\n\n-Sneezing while having diarrhea!`,
  `A wife is like a hand grenade. Take off the ring and say good bye to your house.`,
  `TEACHER : Pappu, your composition on "My Dog" is exactly the same as your brother's. Did you copy this ?\n\nPAPPU : No, Teacher, it's the same Dog.`,
  // v2 additions
  `I told my wife she was drawing her eyebrows too high.\n\nShe looked surprised.`,
  `Why don't scientists trust atoms?\n\nBecause they make up everything.`,
  `I asked the librarian if the library had any books on paranoia.\n\nShe whispered, "They're right behind you!"`,
  `My boss told me to have a good day. So I went home.`,
  `I have a joke about construction...\n\nBut I'm still working on it.`,
  `What do you call a fake noodle?\n\nAn impasta.`,
  `I'm reading a book about anti-gravity.\n\nIt's impossible to put down.`,
  `Why did the scarecrow win an award?\n\nBecause he was outstanding in his field.`,
  `I used to hate facial hair, but then it grew on me.`,
  `What do you call someone with no body and no nose?\n\nNobody knows.`,
  `My therapist says I have a preoccupation with vengeance.\n\nWe'll see about that.`,
  `I told my computer I needed a break.\n\nNow it won't stop sending me Kit-Kat ads.`,
  `Parallel lines have so much in common.\n\nIt's a shame they'll never meet.`,
  `Why did the math book look so sad?\n\nBecause it had too many problems.`,
  `I'm on a seafood diet.\n\nI see food and I eat it.`,
  `A man walks into a library and asks for books about paranoia.\n\nThe librarian whispers, "They're right behind you."`,
  `What's the best thing about Switzerland?\n\nI don't know, but the flag is a big plus.`,
  `I have a fear of speed bumps.\n\nBut I'm slowly getting over it.`,
  `Why don't eggs tell jokes?\n\nThey'd crack each other up.`,
  `Did you hear about the claustrophobic astronaut?\n\nHe just needed a little more space.`,
  `I once got into a fight with a broken elevator.\n\nI was wrong on so many levels.`,
  `What do you call a bear with no teeth?\n\nA gummy bear.`,
  `My friend says to me: "What rhymes with orange?"\n\nI said: "No it doesn't."`,
  `What's the difference between a well-dressed man on a bicycle and a poorly-dressed man on a unicycle?\n\nAttire.`,
  `Why do cows have hooves instead of feet?\n\nBecause they lactose.`,
  `I asked my dog what's two minus two.\n\nHe said nothing.`,
  `Three fish are in a tank.\n\nOne asks the others, "How do you drive this thing?"`,
  `What did the ocean say to the beach?\n\nNothing, it just waved.`,
  `I have a joke about time travel, but you didn't like it.`,
  `Why did the bicycle fall over?\n\nBecause it was two-tired.`,
];

const jokesController = {
  getRandomJoke: (_req: Request, res: Response) => {
    const randomIndex = Math.floor(Math.random() * jokes.length);
    res.send(jokes[randomIndex]);
  },
};

export default jokesController;
