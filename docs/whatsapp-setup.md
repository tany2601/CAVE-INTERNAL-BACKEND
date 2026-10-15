# WhatsApp: bills for customers, reports for admins

When a bill is closed, the customer gets it on WhatsApp. The admin gets a daily, weekly and monthly
report. Both use the **WhatsApp Business Cloud API** (Meta). Without the keys below the app works
exactly as before and simply sends nothing.

## Choose how bills are sent (Admin → Settings → WhatsApp)

Only one way can be on at a time, or both can be off:

| Setting | What happens | Needs the Business API setup below? |
| --- | --- | --- |
| **Off** | bills are not sent on WhatsApp | no |
| **Automatic** | the server sends the bill the moment it closes; also sends the admin reports and lets you send offers | **yes** |
| **Manual** | after billing, the staff screen shows **Send bill on WhatsApp**: one tap opens WhatsApp with the customer's number and the bill already typed in (staff just press send) | no, free |

Under it you choose how the bill looks:

- **Text message**: the bill written out.
- **Picture with details**: a branded picture (CAVE logo, a thank-you, every line, discount, tip, the
  total, payment mode, bill number and time). In *Automatic* it is sent as the picture with the bill
  written under it. In *Manual* staff see the picture and can **Share the bill picture** (the phone's
  share sheet, choose the customer's chat), alongside the one-tap chat link. If the picture cannot be
  made, the customer still gets the text bill.

## What gets sent

| Message | When | Who |
| --- | --- | --- |
| Bill | the moment a bill is closed, if the customer has a valid mobile number (saved at check-in, or typed on the bill screen) | the customer |
| Daily report | every night at 9:30 PM | numbers set in Admin → Settings → WhatsApp |
| Weekly report | Monday 9:00 AM, for the week just ended (Mon–Sun) | same |
| Monthly report | the 1st at 9:00 AM, for the month just ended | same |

- Every message is saved and sent in the background. If WhatsApp is slow or down, billing is not held
  up; failed messages are retried (after 1, 5, 15, 60 and 180 minutes) and the result shows in
  Admin → Settings → WhatsApp → Recent messages.
- A bill is never sent twice (editing or re-closing a bill does not resend it), and a report is never
  sent twice for the same period, even if the server restarts.
- If the server was off at report time it catches up (the daily report the same night; weekly on
  Tuesday; monthly on the 2nd).

## One-time setup (about an hour, plus WhatsApp's approval wait)

1. **Meta account.** Create a Meta Business account at business.facebook.com and a developer app at
   developers.facebook.com (type: *Business*), then add the **WhatsApp** product.
2. **A phone number.** Add the shop's WhatsApp Business number in *WhatsApp → API Setup* and verify it.
   (A number already used on the normal WhatsApp app must be removed from it first.) Copy the
   **Phone number ID**.
3. **A permanent token.** In Business Settings → *System users*, create a system user, give it your
   app and the *whatsapp_business_messaging* + *whatsapp_business_management* permissions, and generate
   a token that never expires. Copy it.
4. **Message templates.** In WhatsApp Manager → *Message templates* → *Create*, language **English**.
   Use these exact names and texts (the `{{n}}` are variables; copy the sample values too, Meta asks
   for them). `cave_bill` and `cave_report` are needed for Automatic; `cave_bill_image` only if you
   choose the picture format; the two `cave_offer…` ones only if you send offers.

   **`cave_bill`**

   ```
   Hi {{1}}, thank you for visiting {{2}}! Your bill: {{3}}. Total paid: {{4}} ({{5}}). Bill no. {{6}}. We hope to see you again!
   ```

   Samples: `Ravi`, `CAVE Karkala`, `Haircut ₹150, Matte Clay ₹599, Tip ₹20`, `₹769`, `Cash`, `6789AB`

   **`cave_report`** (category *Utility*, no header; the plain-text report, used when the Excel can't be attached)

   ```
   CAVE {{1}} report for {{2}}

   Revenue: {{3}} from {{4}} customers
   Tips: {{5}}
   Expenses and advances: {{6}}
   Staff payouts: {{7}}
   Net in hand: {{8}}

   By branch: {{9}}

   Sent by CAVE Men's Salon.
   ```

   Samples: `Daily`, `Tue, 6 Oct 2026`, `₹12,400`, `18`, `₹350`, `₹1,200`, `₹2,100`, `₹9,449`, `Karkala ₹8,200 (11) · Moodbidri ₹4,200 (7)`

   **`cave_report_file`** (category *Utility*, **Header: Document**; for the header sample upload `assets/sample-report.pdf` (Meta's form only accepts a PDF here, not Excel). It is only
   an example for Meta's review: the real attachment is the Excel report `CAVE-report-<date>.xlsx` with every branch,
   customer, bill, service, product, stylist, expense and payout for the period)

   ```
   CAVE {{1}} report for {{2}}

   Revenue: {{3}} from {{4}} customers
   Tips: {{5}}
   Expenses and advances: {{6}}
   Staff payouts: {{7}}
   Net in hand: {{8}}

   By branch: {{9}}

   The full Excel report is attached. Sent by CAVE Men's Salon.
   ```

   (same samples as `cave_report`). If this template is missing or the file cannot be made, the plain `cave_report`
   goes out instead.

   **`cave_bill_image`** (category *Utility*, **Header: Image**; for the header sample upload `assets/sample-bill.png`. It is only an example for Meta's review: the real bill picture is generated and attached for every bill)

   ```
   Hi {{1}}, thank you for visiting {{2}}! Your bill: {{3}}. Total paid: {{4}} ({{5}}). Bill no. {{6}}. We hope to see you again!
   ```

   (same samples as `cave_bill`)

   **`cave_offer`** (category **Marketing**, no header). Add one **Quick reply** button with the text `Stop promotions`
   (WhatsApp recommends an opt-out on every marketing message; the app reads that button as STOP)

   ```
   Hi {{1}}, CAVE Men's Salon has an offer for you:

   {{2}}

   Reply STOP to stop getting offers.
   ```

   Samples: `Ravi`, `Flat 20% off Beard Spa this week. Show this message at the counter.`

   **`cave_offer_image`** (category **Marketing**, **Header: Image** with any JPG/PNG sample): the same text and the
   same `Stop promotions` button as `cave_offer`.

   Approval usually takes minutes to a day. Keep the variables in this order, because the
   app fills them in exactly this order.
5. **Server settings.** In the `.env` on the server add (then `pm2 restart cave-api --update-env`):

   ```env
   WHATSAPP_TOKEN=<the permanent token>
   WHATSAPP_PHONE_NUMBER_ID=<the phone number id>
   # only if you named the templates differently:
   # WHATSAPP_BILL_TEMPLATE=cave_bill
   # WHATSAPP_REPORT_TEMPLATE=cave_report
   # WHATSAPP_REPORT_FILE_TEMPLATE=cave_report_file
   # WHATSAPP_BILL_IMAGE_TEMPLATE=cave_bill_image
   # WHATSAPP_OFFER_TEMPLATE=cave_offer
   # WHATSAPP_OFFER_IMAGE_TEMPLATE=cave_offer_image
   # WHATSAPP_TEMPLATE_LANG=en
   ```

6. **Choose the mode and report numbers.** Admin → Settings → WhatsApp: pick **Automatic**, the bill
   format, up to 3 report numbers and which reports to send, **Save**, then press **Send a test report
   now**. It should arrive within seconds.

## Checking a report yourself (Admin → Settings → WhatsApp → Try a report)

1. Pick **From** and **To** (the same day for a daily report).
2. **Download Excel** makes the file and saves it on your device. Nothing is sent on WhatsApp, and it works
   in any mode, so use it to check the figures first.
3. **Send to WhatsApp** (Automatic mode, saved settings) sends that same report to the report numbers. Watch
   it under *Recent messages*; the Excel arrives as the message's attachment.

The workbook has these sheets: Summary, Branches, Daily, Services, Products, Stylists, Customers, Bills (every
bill), Expenses and Payouts. Every sheet adds up to the Summary, and the Bills total equals revenue plus tips.

## Sending an offer (Admin → Settings → Send an offer)

Needs **Automatic** and the two offer templates. Write the message (up to 600 characters), optionally
add a JPG or PNG picture, and choose **All branches** or one or more branches. The card shows how many
customers it reaches: everyone who has had a bill at the chosen branches and has a valid mobile number
saved, counted once per number. After a confirmation, the offer is queued and the card shows how many
were sent, are waiting or failed.

- Offers are *Marketing* messages: Meta charges more for them than for bills, and only allows them
  to people who agreed to hear from you. Send offers only to customers who have said yes.
- **Who is left out automatically:** customers whose last bill is over a year old, anyone who replied
  STOP (or pressed *Stop promotions*), numbers WhatsApp says are not on WhatsApp, and anyone who already got
  an offer in the last 7 days (`WHATSAPP_OFFER_MIN_DAYS`). The card shows how many were left out.
- **Daily limit:** at most 200 offers in any 24 hours (`WHATSAPP_OFFER_DAILY_LIMIT`). A new number is
  allowed to message only a few hundred different people a day, and going over hurts its quality rating.
  A send that would pass the limit is refused with how many can still go. Offers trickle out about two a second.
- **No repeats:** the exact same offer (same text, picture and branches) can't be sent twice within 24 hours,
  and a customer's number only ever gets one message per offer.
- **Automatic protection:** if WhatsApp says the number is sending too much unwanted mail, or declines
  several offers in a row, offers are **paused** (24 h / 12 h) and a red banner appears in Settings. If WhatsApp
  rejects the token or locks the account, all sending pauses. Fix the cause, then press **Resume**.
- **STOP / START:** when a customer replies STOP they are taken off offers (they still get their bills) and
  get a short confirmation; START puts them back. This needs the webhook below.

## Webhook (needed for delivery ticks and STOP replies)

1. In Meta → your app → WhatsApp → *Configuration* → Webhook: callback URL
   `https://api-cave.paperlighttech.com/api/webhooks/whatsapp`, verify token = the value of `WHATSAPP_VERIFY_TOKEN`
   (any long random string you choose, also put it in the server `.env`). Click *Verify and save*.
2. *Webhook fields*: subscribe to **messages**.
3. Put the **App secret** (Meta → App settings → Basic) in the server `.env` as `WHATSAPP_APP_SECRET`
   and restart. Every webhook request is checked against it; unsigned or altered requests get 401.
4. Check: send yourself a bill. *Recent messages* shows **Sent ✓**, then **Delivered ✓✓**, then **Read ✓✓**.

The webhook cannot be tested from your laptop (Meta needs a public address); do it on the server.

## Going live checklist

- [ ] All five templates show **Active** in WhatsApp Manager (`cave_bill`, `cave_bill_image`, `cave_report`,
      `cave_report_file`, `cave_offer`, `cave_offer_image`; the two offer ones only if you send offers).
- [ ] A **permanent** token from a *System User* (Business Settings → Users → System users → Generate token, with
      `whatsapp_business_messaging` and `whatsapp_business_management`). The test token expires in 24 hours.
- [ ] Production `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` set, backend restarted.
- [ ] Webhook verified and subscribed to **messages** (above).
- [ ] Payment method added in WhatsApp Manager (template messages are charged).
- [ ] Business verification started in Meta Business Settings (raises the daily limit beyond the starting tier).
- [ ] The two admin numbers are added under *Send reports to* and each has received a test report.
- [ ] Customers are told at check-in that bills (and, if you send them, offers) come on WhatsApp.

## Going live with the client's existing WhatsApp Business number

The client already uses a number in the **WhatsApp Business app** and wants to keep using it there while the
software sends bills and reports from the same number. Meta calls this **coexistence**. Do not use the normal
"register a number" flow for this: completing it for a number that is active in the app can move the number
off the app. Check Meta's current documentation (WhatsApp Cloud API → *Coexistence* / *Embedded Signup*) for the
exact steps and eligibility (app version, how long the number has been active, supported country); they change.

Who does what:

| Step | Who | Notes |
| --- | --- | --- |
| 1. Business verification (Meta Business Settings → Security centre) | Client owner | Raises the daily message limit; start early, it takes days |
| 2. Add the number to the WhatsApp Business Account through Meta's coexistence flow (the client scans a QR code in their Business app) | Client owner, on their phone | Not completing a verification-code registration of the number |
| 3. Payment method in WhatsApp Manager → Billing | Client owner | Template messages are charged |
| 4. **Re-submit every template in the production WhatsApp account** (`cave_bill`, `cave_bill_image`, `cave_report`, `cave_report_file`, later the offer ones) with the same text as here | You | Approved templates in the *test* account do not exist in the production one |
| 5. System User token with `whatsapp_business_messaging` + `whatsapp_business_management`, with the production account assigned to it | You | Never expires |
| 6. Set the server `.env` (below), restart, press **Resume** if paused | You | |
| 7. Webhook (callback URL, verify token, app secret, subscribe to **messages**) | You | See "Webhook" above |
| 8. Switch the app to **Automatic** in Admin → Settings → WhatsApp, add the two admin numbers, send a test report and one real bill | You | Start with your own number |

Server `.env` for production (values come from Meta; never paste them in chat or commit them):

```
WHATSAPP_TOKEN=<system user token>
WHATSAPP_PHONE_NUMBER_ID=<the production number's id (WhatsApp Manager → Phone numbers)>
WHATSAPP_API_VERSION=v25.0
WHATSAPP_TEMPLATE_LANG=en
WHATSAPP_APP_SECRET=<Meta app → Settings → Basic → App secret>
WHATSAPP_VERIFY_TOKEN=<a long random string: openssl rand -hex 24>
DB_POOL_MAX=8
```

## Good to know

- **Cost.** Meta charges per conversation (Utility templates, India: roughly ₹0.15–0.80 each, with a
  monthly free allowance). Check current rates in WhatsApp Manager → *Billing*.
- **Consent.** WhatsApp requires customers to have agreed to receive messages. Tell customers at
  check-in that their bill will be sent on WhatsApp, and only enter numbers people have given you.
- **Delivery.** "Sent ✓" in the log means WhatsApp accepted the message; with the webhook set up it becomes
  "Delivered ✓✓" and "Read ✓✓". A customer who is not on WhatsApp shows as *Failed* with WhatsApp's reason, is
  not retried, and is not messaged again for 30 days.
- **Never twice.** Every bill, report and offer has a unique key saved before sending, a message is claimed
  before it is sent (so two server processes can't both send it), and editing or re-closing a bill never resends it.
- **Phone numbers.** Ten-digit Indian mobile numbers (6–9…) are used; `+91`, spaces and a leading 0
  are handled. Anything else is skipped.

## Troubleshooting

| In *Recent messages* | Meaning |
| --- | --- |
| nothing at all, status "Not set up" | the two `WHATSAPP_…` values are missing on the server |
| Failed: "Template name does not exist" | the template is not approved yet, or is named differently |
| Failed: "(#132000) number of parameters…" | the template text differs from the one above |
| Failed: "Recipient not on WhatsApp" | the customer's number has no WhatsApp |
| Failed: "Error validating access token" | the token expired or lacks permissions; make a new permanent one |
| Queued for a long time | the API process is stopped; `pm2 logs cave-api` |
