// app/text/page.jsx
export default function Page() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          window.location.href = "sms:7043034112?&body=Hi%20OSR%20Pros,%20t%C3%B4i%20mu%E1%BB%91n%20l%C3%A0m%20l%E1%BA%A1i%20ti%E1%BB%87m%20nail%20c%E1%BB%A7a%20m%C3%ACnh.";
        `,
      }}
    />
  );
}
