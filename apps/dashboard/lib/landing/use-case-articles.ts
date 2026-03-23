export const USE_CASE_SLUGS = [
  'general-clinics',
  'beauty-aesthetic-clinics',
  'solo-practitioners',
  'multi-doctor-practices',
  'dental-clinics',
  'mental-health-practices',
] as const;

export type UseCaseSlug = (typeof USE_CASE_SLUGS)[number];

type ArticleBullet = {
  heading: string;
  text: string;
};

type ArticleSection = {
  title: string;
  paragraphs?: string[];
  bullets?: ArticleBullet[];
};

type ArticleTestimonial = {
  title: string;
  quote: string;
  attribution: string;
};

type ArticleCta = {
  title: string;
  description: string;
};

export type UseCaseArticle = {
  slug: UseCaseSlug;
  category: string;
  clinicLabel: string;
  heroTitle: string;
  intro: string[];
  sections: ArticleSection[];
  testimonial: ArticleTestimonial;
  cta: ArticleCta;
};

export const USE_CASE_ARTICLES: UseCaseArticle[] = [
  {
    slug: 'general-clinics',
    category: 'Use Case',
    clinicLabel: 'General Clinics',
    heroTitle: 'Your Clinic Is Fully Booked. Your Staff Is Drowning. These Are Not the Same Problem.',
    intro: [
      'Every morning, before the first patient walks through the door, your front desk is already behind.',
      'The phone rings while someone is checking in. A patient asks about their appointment while another one asks about pricing. Someone wants to reschedule. Someone else never confirmed their booking from yesterday, and now there is a gap in the schedule that nobody noticed until it was too late.',
      'This is not a staffing problem. You could hire two more people and still run into the same wall. Because the issue is not the number of hands, it is the number of repetitive, low-complexity interactions eating up those hands every single day.',
      'Somewhere between answering "What are your clinic hours?" for the twelfth time and manually sending a reminder to a patient who will probably still not show up, the real work gets delayed.',
    ],
    sections: [
      {
        title: 'The Problem Is Not Chaos. It Is That Chaos Has Become Normal.',
        paragraphs: [
          'Most clinic owners have adapted. They have learned to live with the noise. A missed call here, a double booking there, it is just part of running a busy practice, right?',
          'Wrong. These small cracks compound. A patient who could not get through on the phone books with your competitor. A no-show that was not reminded leaves a slot empty. A staff member who spends 40% of their day on WhatsApp replies has 40% less time for patients who are physically in front of them.',
          'The cost is invisible until you start measuring it.',
        ],
      },
      {
        title: 'What If the Front Desk Never Slept, Never Got Overwhelmed, and Never Made a Booking Error?',
        paragraphs: [
          'That is what Chattiphy does for general clinics.',
          'It handles the entire intake and communication layer automatically through WhatsApp, so your staff can focus on the work that actually requires a human.',
        ],
        bullets: [
          {
            heading: 'Bookings on autopilot',
            text: 'Patients send a message, pick a time, and get a confirmation without a single staff member involved. Your schedule fills itself.',
          },
          {
            heading: 'FAQ handling at scale',
            text: 'Pricing, directions, preparation instructions, insurance questions. Chattiphy answers instantly, accurately, and at any hour.',
          },
          {
            heading: 'Automated reminders that get read',
            text: 'WhatsApp messages have a 98% open rate. Your patients will see the reminder, and most will show up.',
          },
          {
            heading: 'Smart rescheduling',
            text: 'When a patient needs to change their slot, they do it through WhatsApp and the system updates the calendar. No phone tag, no manual entry.',
          },
        ],
      },
    ],
    testimonial: {
      title: 'Clinics Like Yours Are Already Running Leaner',
      quote:
        'We went from managing 3 WhatsApp numbers manually to one automated system. Bookings are up, complaints are down, and our staff actually leaves on time now.',
      attribution: '[Clinic name, City] (placeholder - replace with real testimonial)',
    },
    cta: {
      title: 'See If It Works for Your Clinic',
      description:
        'No pitch. No pressure. Book a 30-minute demo and see exactly how Chattiphy would work for your specific volume and workflow.',
    },
  },
  {
    slug: 'beauty-aesthetic-clinics',
    category: 'Use Case',
    clinicLabel: 'Beauty & Aesthetic Clinics',
    heroTitle:
      'Your Treatments Create Results Worth Talking About. Your Booking Process Should Not Be What They Remember.',
    intro: [
      'The consultation went perfectly. The treatment was flawless. The patient left glowing, literally.',
      'Then they tried to book a follow-up.',
      'They called the clinic. No answer. They sent a WhatsApp. The reply came six hours later. By the time someone got back to them with available slots, they had already booked somewhere else. Not because your service was worse, but because the experience around your service was.',
      'In aesthetic medicine, the experience is the product. From the first touchpoint to the last follow-up, patients are evaluating you. And right now, that first touchpoint is often a delayed message or a missed call.',
    ],
    sections: [
      {
        title: 'Aesthetic Patients Are Different. Their Expectations Are Higher.',
        paragraphs: [
          'People who invest in aesthetic treatments are, by nature, investing in how things look and feel. They notice the details. They compare experiences. They talk.',
          'A patient who books a facial at your clinic and gets an instant confirmation, a pre-appointment prep guide, and a gentle reminder the day before feels cared for before she even arrives. That is the experience she tells her friends about.',
          'A patient who had to follow up twice just to confirm her slot still might come. But she is already quietly comparing you to somewhere else.',
          'The treatment you provide takes skill and years of training. The communication around it just takes the right system.',
        ],
      },
      {
        title: 'Let Patients Book, Ask, and Prepare. All on WhatsApp, All Without Involving Your Staff.',
        paragraphs: [
          'Chattiphy handles the full communication journey for beauty and aesthetic clinics, from first inquiry to post-treatment follow-up.',
        ],
        bullets: [
          {
            heading: 'Instant responses to treatment questions',
            text: 'Questions like "How long does filler last?" or "What should I avoid before laser?" are answered immediately, accurately, 24/7.',
          },
          {
            heading: 'Frictionless booking',
            text: 'Patients browse available slots, select their treatment, and confirm all through WhatsApp. No forms, no hold music, no back-and-forth.',
          },
          {
            heading: 'Pre-treatment prep sent automatically',
            text: 'The right instructions reach the right patient at the right time. Patients arrive prepared and treatments run smoother.',
          },
          {
            heading: 'Post-treatment check-ins',
            text: 'A message the next day asking how they are feeling is not just good care, it is retention and repeat visits.',
          },
        ],
      },
    ],
    testimonial: {
      title: 'What Patients Say When the Experience Matches the Treatment',
      quote:
        'I used to lose bookings just because I could not reply fast enough on busy days. Now the system handles inquiries while I am in the treatment room. My booking rate went up by [X]%.',
      attribution: '[Clinic name, City] (placeholder - replace with real testimonial)',
    },
    cta: {
      title: 'Your Treatments Deserve a Booking Experience That Matches',
      description:
        'Book a 30-minute demo. We will show you exactly how Chattiphy fits your treatments, workflow, and patient journey.',
    },
  },
  {
    slug: 'solo-practitioners',
    category: 'Use Case',
    clinicLabel: 'Solo Practitioners',
    heroTitle:
      'You Went to Medical School to Be a Doctor. Not a Receptionist, Scheduler, and Customer Service Rep.',
    intro: [
      'At some point in your career, you made peace with it: you do it all.',
      'You see patients. You handle follow-ups. You answer "is this normal?" messages at 10pm. You manage your own schedule, send your own reminders, and reply to booking inquiries between appointments, sometimes from your car.',
      'You chose to practice independently because you wanted ownership and control. What you did not sign up for was spending a third of your day on administrative tasks that have nothing to do with medicine.',
      'The math does not work in your favor right now. There are only so many hours, and too many of them are going to the wrong things.',
    ],
    sections: [
      {
        title: 'The Hidden Cost of Running Solo Without Support',
        paragraphs: [
          'Administrative overhead costs more than time.',
          'When you are fielding booking messages between patients, your attention is split. When you are manually sending reminders the night before, you are using mental energy that should be going toward rest. When a patient cannot reach you and books elsewhere, that is revenue gone and a relationship that never started.',
          'Hiring a full-time receptionist changes the financial math entirely, and for many solo practitioners it simply does not pencil out.',
          'There is a gap between doing it all yourself and hiring someone full-time. That gap has a solution.',
        ],
      },
      {
        title: 'Chattiphy Is the Front Desk You Have Been Putting Off Hiring',
        paragraphs: [
          'Chattiphy handles patient communication automatically through WhatsApp, so you can be fully present with the patient in front of you.',
        ],
        bullets: [
          {
            heading: 'Bookings happen without you',
            text: 'A patient messages your clinic number, gets available slots, confirms, and it appears in your calendar without your involvement.',
          },
          {
            heading: 'Common questions are answered immediately',
            text: 'Hours, location, what to bring, and preparation guidance are available any time patients ask.',
          },
          {
            heading: 'Reminders go out automatically',
            text: 'No-shows drop and your day stays full without manual follow-up.',
          },
          {
            heading: 'Follow-ups are handled',
            text: 'Post-appointment check-ins go out on schedule so patients feel cared for and return.',
          },
        ],
      },
    ],
    testimonial: {
      title: 'What Solo Practitioners Say After the First Month',
      quote:
        'I was skeptical. I thought it would feel impersonal. But patients actually respond more to WhatsApp reminders than they ever did to my manual calls. And I got back almost two hours a day.',
      attribution: '[Dr. Name, Practice Name] (placeholder - replace with real testimonial)',
    },
    cta: {
      title: 'See How It Works for a One-Person Practice',
      description:
        'The demo is 30 minutes. We will walk through exactly how Chattiphy fits your hours, patient volume, and communication style.',
    },
  },
  {
    slug: 'multi-doctor-practices',
    category: 'Use Case',
    clinicLabel: 'Multi-Doctor Practices',
    heroTitle: 'Adding More Doctors Should Not Mean Adding More Chaos.',
    intro: [
      'The growth was the goal. More doctors, more capacity, more patients served. That part worked.',
      'What did not scale as cleanly: everything else.',
      'Patients call and do not know which doctor to ask for. Booking staff manually cross-check multiple calendars and still create conflicts. Inquiries meant for one doctor get routed to another. Returning patients are accidentally booked with the wrong provider.',
      'Coordination at this level requires systems, not just effort. Most multi-doctor practices are still running on effort.',
    ],
    sections: [
      {
        title: 'The Coordination Problem Gets Harder With Every Doctor You Add',
        paragraphs: [
          'With one doctor, scheduling logic is simple. With three, it multiplies. With five, it becomes a full-time job before a single patient is seen.',
          'Your front desk team is good, but they are managing complexity that should be handled by infrastructure. Every manual decision about which doctor, which slot, and which calendar is a failure point.',
          'The problem is not your staff. They are solving a systems problem with human effort.',
        ],
      },
      {
        title: 'Chattiphy Routes, Schedules, and Coordinates Automatically',
        paragraphs: [
          'For multi-doctor practices, Chattiphy acts as an intelligent scheduling layer between your patients and your calendars.',
        ],
        bullets: [
          {
            heading: 'Smart patient routing',
            text: 'Returning patients are directed to their usual doctor. New patients are matched based on your own availability and specialty rules.',
          },
          {
            heading: 'Unified inbox, individual calendars',
            text: 'All patient messages come through one system while each doctor schedule stays separate and conflict-free.',
          },
          {
            heading: 'Simultaneous capacity',
            text: 'Multiple patients can book at the same time, including peak hours, without queue bottlenecks for staff.',
          },
          {
            heading: 'Staff sees the full picture',
            text: 'Your team gets a clear cross-practice view of who is booked, what is confirmed, and what is pending.',
          },
        ],
      },
    ],
    testimonial: {
      title: 'Practices With Multiple Doctors Are Already Seeing the Difference',
      quote:
        'Managing four doctors schedules used to require two full-time coordinators. With Chattiphy, we have one coordinator doing exception handling while the system manages routing. It is a completely different operation.',
      attribution: '[Practice Name, City] (placeholder - replace with real testimonial)',
    },
    cta: {
      title: 'Book a Demo Tailored to Multi-Doctor Practices',
      description:
        'We will show you routing logic, calendar integration, and patient management at your scale with your current workflows.',
    },
  },
  {
    slug: 'dental-clinics',
    category: 'Use Case',
    clinicLabel: 'Dental Clinics',
    heroTitle:
      'The Appointment Was Booked. The Patient Just Forgot. And Now You Have a 45-Minute Gap You Cannot Fill.',
    intro: [
      "It is 10:15. The 10 o'clock patient has not arrived.",
      'Your front desk calls. Voicemail. Another call. Still nothing. The dentist is ready. The room is set up. The slot booked three weeks ago is now empty, and too late to fill.',
      'This happens multiple times a week in most dental clinics. Each no-show impacts revenue, schedule efficiency, and staff morale.',
      'Most of these patients did not intend to no-show. They just forgot. That is not a loyalty problem. It is a reminder problem.',
    ],
    sections: [
      {
        title: 'Why Phone Call Reminders Do Not Work Anymore',
        paragraphs: [
          'Traditional phone reminders are increasingly ineffective. People screen unknown numbers. Voicemails go unheard. Calls require immediate attention and many patients do not engage.',
          'WhatsApp is different. It has a 98% open rate. Patients read it, respond to it, and can confirm, reschedule, or cancel directly in the same thread.',
          'The reminder the patient actually reads is the reminder that works.',
        ],
      },
      {
        title: 'Chattiphy Cuts No-Shows With Automated WhatsApp Communication',
        paragraphs: [
          'For dental clinics, Chattiphy manages the full appointment communication cycle from booking confirmation to day-of reminder without manual outreach from staff.',
        ],
        bullets: [
          {
            heading: 'Instant booking confirmation',
            text: 'Patients get appointment details immediately in WhatsApp and can refer back at any time.',
          },
          {
            heading: 'Automated reminders at the right time',
            text: 'A reminder 48 hours out and another the morning of keeps attendance high without feeling intrusive.',
          },
          {
            heading: 'One-tap confirm, reschedule, or cancel',
            text: 'When a patient cannot make it, they reply in-thread and your calendar updates early enough to refill the slot.',
          },
          {
            heading: 'New patient intake automated',
            text: 'First-time patients receive intake questions and preparation instructions before arrival, reducing chairside paperwork.',
          },
        ],
      },
    ],
    testimonial: {
      title: 'Dental Clinics Are Measuring the Difference',
      quote:
        'Our no-show rate dropped from around 18% to under 5% within the first two months. That is revenue we were losing every week without realizing how much.',
      attribution: '[Clinic Name, City] (placeholder - replace with real testimonial)',
    },
    cta: {
      title: 'See How It Works for Your Clinic',
      description:
        'In a 30-minute demo, we will walk through reminder sequencing, confirmation flows, and schedule integration for dental workflows.',
    },
  },
  {
    slug: 'mental-health-practices',
    category: 'Use Case',
    clinicLabel: 'Mental Health Practices',
    heroTitle: 'The Hardest Part of Getting Help Should Not Be Making the Call.',
    intro: [
      'For someone considering therapy for the first time, reaching out is already an act of courage.',
      'They have thought about it for weeks or months. They decide to try, find your number, and then they have to call, speak to a stranger, and say out loud for the first time that they need help.',
      'Some do it. Many do not. Not because they do not need support, but because the phone call itself is one barrier too many.',
      'The gap between "I should talk to someone" and "I actually booked an appointment" is wider than most practices realize. Intake accessibility determines how many people make it across.',
    ],
    sections: [
      {
        title: 'The Medium Matters for Mental Health',
        paragraphs: [
          'Patients seeking mental health support are navigating a different emotional landscape than someone booking a routine treatment. Privacy matters enormously.',
          'A phone call can be overheard and can feel exposing. A WhatsApp message is private, asynchronous, and patient-controlled.',
          'For many first-timers, younger adults, or people dealing with anxiety, the medium is not a convenience preference. It is part of whether they reach out at all.',
        ],
      },
      {
        title: 'Chattiphy Creates a Discreet, Always-Available Path Into Your Practice',
        paragraphs: [
          'For mental health practices, Chattiphy handles intake and communication in a way that respects sensitivity while ensuring every patient receives a prompt and professional response.',
          'More people reach out. More people book. And every interaction before the first appointment communicates one message: this is a safe place.',
        ],
        bullets: [
          {
            heading: 'Private text-based booking',
            text: 'Patients can inquire, ask questions, and book appointments through WhatsApp without speaking to anyone, lowering the initial barrier.',
          },
          {
            heading: 'Sensitive FAQ handling',
            text: 'Questions around fees, roles, and confidentiality are answered accurately, immediately, and without judgment.',
          },
          {
            heading: 'Warm appointment reminders',
            text: 'Reminders are automatic and supportive in tone. Patients confirm in-chat and no-shows drop without awkward phone calls.',
          },
          {
            heading: 'Always available after hours',
            text: 'When someone is ready at 11pm, Chattiphy responds immediately and captures intent until your team follows up.',
          },
        ],
      },
    ],
    testimonial: {
      title: 'When Accessibility Increases, So Does Impact',
      quote:
        'We noticed a significant increase in first-time bookings after switching to WhatsApp-based intake. Patients told us they appreciated not having to call. For a mental health practice, that feedback means everything.',
      attribution: '[Practice Name, City] (placeholder - replace with real testimonial)',
    },
    cta: {
      title: 'Talk to Us About Your Practice',
      description:
        'Mental health practices have specific needs around tone, privacy, and sensitivity. The demo is a conversation, not a sales presentation.',
    },
  },
];

export function getUseCaseArticle(slug: string) {
  return USE_CASE_ARTICLES.find((article) => article.slug === slug);
}
