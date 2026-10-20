# Bank SMS capture: setup on your iPhone

Each bank or card text can add itself to Transactions as **Unverified** the moment it arrives. You verify it later. OTPs, offers and balance-only texts are skipped.

## 1. Make your private link (in the app)
Settings > Integrations > **Bank texts**: pick the default payment method (used when a text does not say which card or bank), then **Create link**. Copy the link. Treat it like a password: anyone with it can add entries (not read them). If it leaks, create a new link and the old one stops.

Press **Try a message** and paste a sample SMS to see what would be added. Nothing is saved there.

## 2. Make the Shortcut (iPhone)
1. Open **Shortcuts > Automation > + > Message**.
2. Sender: your bank's sender name (for example `HDFCBK`, `AMEXIN`). Add one automation per sender, or use "Message contains" such as `debited`, `spent`, `credited`.
3. Choose **Run Immediately** (turn off "Notify When Run").
4. Add the action **Get Contents of URL**:
   - URL: your private link
   - Method: **POST**
   - Request Body: **JSON**, with one field: `text` = the **Shortcut Input** (the message).
5. Save. Send yourself a test or wait for the next bank text.

## Android
Use any SMS forwarder app that can POST JSON `{"text": "<message>"}` to the link on each matching message.

## Good to know
- The default payment method is used only when the text names no card or bank.
- A card-due text ("Total Amt Due ... Due Date ...") creates the card bill (the full amount, never the minimum).
- Up to 300 texts a day per link. Duplicates are skipped.
