package auth

import (
	"bytes"
	"fmt"
	"html/template"
)

// otpEmail is the content of one OTP email, shared by every real mailer
// so Resend and Brevo send the same message.
type otpEmail struct {
	Subject string
	Text    string
	HTML    string
}

// The logo is drawn with a table cell instead of an <img>: Gmail and most
// clients block or strip images (and data: URIs) by default, and ABRO has
// no public asset URL yet. It mirrors the splash screen's "AB" mark in
// the accent gradient; the solid background is the fallback for clients
// that ignore gradients (Outlook).
var otpEmailHTML = template.Must(template.New("otp").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{.Subject}}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f3f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f3f6;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e2330;">
<tr><td style="padding:32px 32px 8px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" height="44" align="center" valign="middle" style="width:44px;height:44px;border-radius:12px;background-color:#6366f1;background-image:linear-gradient(135deg,#6366f1,#a855f7);color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-1px;">AB</td>
<td style="padding-left:12px;font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#1e2330;">ABRO</td>
</tr></table>
</td></tr>
<tr><td style="padding:24px 32px 0 32px;font-size:16px;line-height:24px;">
<p style="margin:0 0 16px 0;">Hi,</p>
<p style="margin:0 0 24px 0;">We received a request to sign in to ABRO with this email address. Enter this code to continue:</p>
</td></tr>
<tr><td align="center" style="padding:0 32px;">
<div style="background-color:#eef2ff;border-radius:12px;padding:20px 12px 20px 22px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#4f46e5;">{{.Code}}</div>
</td></tr>
<tr><td style="padding:24px 32px 0 32px;font-size:15px;line-height:22px;color:#3d4452;">
<p style="margin:0 0 16px 0;">This code expires in {{.TTLMinutes}} minutes.</p>
<p style="margin:0 0 16px 0;"><strong style="color:#1e2330;">Don't share this code with anyone.</strong> ABRO will never ask you for it by phone, message or email. Anyone who has this code can sign in to your account.</p>
<p style="margin:0;">If you didn't try to sign in, you can safely ignore this email. Nobody can get into your account without the code.</p>
</td></tr>
<tr><td style="padding:32px;">
<hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px 0;">
<p style="margin:0;font-size:12px;line-height:18px;color:#9aa0ae;">This message was sent to {{.Email}} because a sign-in was requested on ABRO.<br>ABRO &middot; Remember every expense. Forget the confusion.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`))

const otpEmailText = `Hi,

We received a request to sign in to ABRO with this email address. Enter this code to continue:

    %s

This code expires in %d minutes.

Don't share this code with anyone. ABRO will never ask you for it by phone, message or email. Anyone who has this code can sign in to your account.

If you didn't try to sign in, you can safely ignore this email. Nobody can get into your account without the code.

--
This message was sent to %s because a sign-in was requested on ABRO.
`

// buildOTPEmail renders the subject, plain-text and HTML bodies. The code
// leads the subject (as Facebook and Google do) so it shows in the inbox
// list and phone notification without opening the email.
func buildOTPEmail(email, code string) (otpEmail, error) {
	ttlMinutes := int(otpTTL.Minutes())
	subject := fmt.Sprintf("%s is your ABRO verification code", code)

	var html bytes.Buffer
	err := otpEmailHTML.Execute(&html, struct {
		Subject, Code, Email string
		TTLMinutes           int
	}{subject, code, email, ttlMinutes})
	if err != nil {
		return otpEmail{}, fmt.Errorf("rendering OTP email: %w", err)
	}

	return otpEmail{
		Subject: subject,
		Text:    fmt.Sprintf(otpEmailText, code, ttlMinutes, email),
		HTML:    html.String(),
	}, nil
}
