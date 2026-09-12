const PAGE_URL =
  "https://topic17z2k407.jin10.com/topic/jin10_important_news.html?from=web_homepage";

const PAGE_ORIGIN =
  "https://topic17z2k407.jin10.com";

const PAGE_REFERER =
  "https://topic17z2k407.jin10.com/";

const USERINFO_URL =
  "https://uc-api.jin10.com/userinfo?forceUpdate=true";

const API_PATH =
  "/top/flashsByTime?time_type=time&sort=priority";

const FALLBACK_API_HOST =
  "1b8d6028d99849668a6d8755c79e650f.z3c.jin10.com";

const X_APP_ID =
  "EzF2s2HxxU0U5bYa";

const X_VERSION =
  "1.0.0";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/151.0.0.0 Safari/537.36";

const CACHE_KEY =
  "https://cache.local/jin10-important.xml";


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(
        [
          "Jin10 RSS Worker is running.",
          "",
          "RSS:",
          `${url.origin}/jin10-important`,
        ].join("\n"),
        {
          headers: {
            "content-type":
              "text/plain; charset=utf-8",
          },
        }
      );
    }

    if (
      url.pathname === "/jin10-important"
    ) {
      try {
        const rss =
          await buildJin10ImportantRSS();

        return new Response(
          rss,
          {
            headers: {
              "content-type":
                "application/rss+xml; charset=utf-8",
              "cache-control":
                "public, max-age=300",
            },
          }
        );
      } catch (error) {
        return new Response(
          `RSS generation failed:\n${error.stack || error}`,
          {
            status: 500,
            headers: {
              "content-type":
                "text/plain; charset=utf-8",
            },
          }
        );
      }
    }

    return new Response(
      "Not Found",
      {
        status: 404,
      }
    );
  },

  async scheduled(
    controller,
    env,
    ctx
  ) {
    ctx.waitUntil(
      buildJin10ImportantRSS()
        .then(() => {
          console.log(
            "Scheduled Jin10 refresh OK"
          );
        })
        .catch((error) => {
          console.error(
            "Scheduled refresh failed",
            error
          );
        })
    );
  },
};


async function buildJin10ImportantRSS() {
  const cookieJar = [];

  const pageResponse =
    await fetch(PAGE_URL, {
      headers: {
        "User-Agent":
          USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });

  if (!pageResponse.ok) {
    throw new Error(
      `Page HTTP ${pageResponse.status}`
    );
  }

  const pageHTML =
    await pageResponse.text();

  collectCookies(
    pageResponse,
    cookieJar
  );

  const userInfoResponse =
    await fetch(
      USERINFO_URL,
      {
        headers:
          buildHeaders(
            cookieJar
          ),
      }
    );

  collectCookies(
    userInfoResponse,
    cookieJar
  );

  console.log(
    "Userinfo status:",
    userInfoResponse.status
  );

  const apiHosts =
    await discoverAPIHosts(
      pageHTML
    );

  if (
    !apiHosts.includes(
      FALLBACK_API_HOST
    )
  ) {
    apiHosts.push(
      FALLBACK_API_HOST
    );
  }

  let lastError = null;

  for (
    const host of apiHosts
  ) {
    const apiURL =
      `https://${host}${API_PATH}`;

    try {
      console.log(
        "Trying:",
        apiURL
      );

      const response =
        await fetch(
          apiURL,
          {
            headers:
              buildHeaders(
                cookieJar
              ),
          }
        );

      console.log(
        "API status:",
        response.status
      );

      if (!response.ok) {
        lastError =
          new Error(
            `HTTP ${response.status}`
          );
        continue;
      }

      const payload =
        await response.json();

      if (
        payload.status !== 200
      ) {
        lastError =
          new Error(
            `API status ${payload.status}`
          );
        continue;
      }

      if (
        !Array.isArray(
          payload.data
        ) ||
        payload.data.length === 0
      ) {
        lastError =
          new Error(
            "API returned no items"
          );
        continue;
      }

      return generateRSS(
        payload.data
      );
    } catch (error) {
      lastError =
        error;
    }
  }

  throw (
    lastError ||
    new Error(
      "All Jin10 API hosts failed"
    )
  );
}


function buildHeaders(
  cookieJar
) {
  const headers = {
    Accept:
      "*/*",
    "Accept-Language":
      "zh-CN,zh;q=0.9,en;q=0.8",
    "Content-Type":
      "application/json",
    Origin:
      PAGE_ORIGIN,
    Referer:
      PAGE_REFERER,
    "User-Agent":
      USER_AGENT,
    "x-app-id":
      X_APP_ID,
    "x-version":
      X_VERSION,
  };

  if (
    cookieJar.length
  ) {
    headers.Cookie =
      cookieJar.join("; ");
  }

  return headers;
}


function collectCookies(
  response,
  cookieJar
) {
  const raw =
    response.headers.get(
      "set-cookie"
    );

  if (!raw) {
    return;
  }

  const parts =
    raw.split(
      /,(?=[^;,]+=)/
    );

  for (
    const part of parts
  ) {
    const cookie =
      part.split(";")[0]
        .trim();

    if (!cookie) {
      continue;
    }

    const name =
      cookie.split("=")[0];

    const index =
      cookieJar.findIndex(
        item =>
          item.startsWith(
            `${name}=`
          )
      );

    if (index >= 0) {
      cookieJar[index] =
        cookie;
    } else {
      cookieJar.push(
        cookie
      );
    }
  }
}


async function discoverAPIHosts(
  pageHTML
) {
  const hosts =
    new Set();

  addHosts(
    pageHTML,
    hosts
  );

  const scriptRegex =
    /<script[^>]+src=["']([^"']+)["']/gi;

  const scripts = [];

  let match;

  while (
    (
      match =
        scriptRegex.exec(
          pageHTML
        )
    ) !== null
  ) {
    scripts.push(
      match[1]
    );
  }

  for (
    const src of scripts
  ) {
    try {
      const jsURL =
        new URL(
          src,
          PAGE_URL
        ).href;

      const response =
        await fetch(
          jsURL,
          {
            headers: {
              "User-Agent":
                USER_AGENT,
              Referer:
                PAGE_URL,
            },
          }
        );

      if (!response.ok) {
        continue;
      }

      const text =
        await response.text();

      addHosts(
        text,
        hosts
      );
    } catch (_) {
      // ignore
    }
  }

  return [
    ...hosts,
  ];
}


function addHosts(
  text,
  hosts
) {
  const regex =
    /([a-zA-Z0-9]+\.z3c\.jin10\.com)/g;

  let match;

  while (
    (
      match =
        regex.exec(
          text || ""
        )
    ) !== null
  ) {
    hosts.add(
      match[1]
    );
  }
}


function generateRSS(
  items
) {
  const rssItems = [];

  for (
    const wrapper of items
  ) {
    const itemId =
      String(
        wrapper?.item_id ||
        ""
      ).trim();

    const outer =
      wrapper?.data || {};

    const inner =
      outer?.data || {};

    const content =
      String(
        inner?.content ||
        ""
      ).trim();

    const title =
      extractTitle(
        inner,
        content
      );

    const link =
      chooseLink(
        itemId,
        inner
      );

    const pubDate =
      parsePubDate(
        outer?.time
      );

    const description =
      buildDescription(
        inner,
        outer
      );

    if (!title) {
      continue;
    }

    rssItems.push(`
<item>
  <title>${escapeXML(title)}</title>
  <link>${escapeXML(link)}</link>
  <guid isPermaLink="false">${escapeXML(itemId || link)}</guid>
  <pubDate>${escapeXML(pubDate)}</pubDate>
  <description><![CDATA[${description}]]></description>
</item>`);
  }

  if (
    rssItems.length === 0
  ) {
    throw new Error(
      "No valid RSS items"
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>金十数据 - 重要事件</title>
  <link>${escapeXML(PAGE_URL)}</link>
  <description>金十数据重要事件 RSS</description>
  <language>zh-cn</language>
  <generator>Cloudflare Worker</generator>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  ${rssItems.join("\n")}
</channel>
</rss>`;
}


function extractTitle(
  inner,
  content
) {
  const title =
    String(
      inner?.title ||
      ""
    ).trim();

  if (title) {
    return title;
  }

  const match =
    content.match(
      /^【([^】]+)】/
    );

  if (match) {
    return (
      match[1].trim()
    );
  }

  const clean =
    content
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (
    clean.length > 60
  ) {
    return (
      clean.slice(0, 60) +
      "…"
    );
  }

  return (
    clean ||
    "金十重要事件"
  );
}


function chooseLink(
  itemId,
  inner
) {
  const link =
    String(
      inner?.link ||
      ""
    ).trim();

  if (link) {
    return link;
  }

  const sourceLink =
    String(
      inner?.source_link ||
      ""
    ).trim();

  if (sourceLink) {
    return sourceLink;
  }

  return (
    "https://flash.jin10.com/detail/" +
    itemId
  );
}


function buildDescription(
  inner,
  outer
) {
  const parts = [];

  const pic =
    String(
      inner?.pic ||
      ""
    ).trim();

  if (pic) {
    parts.push(
      `<p><img src="${escapeHTML(pic)}" style="max-width:100%;height:auto;" /></p>`
    );
  }

  const content =
    String(
      inner?.content ||
      ""
    ).trim();

  if (content) {
    parts.push(
      `<p>${escapeHTML(content)}</p>`
    );
  }

  const source =
    String(
      inner?.source ||
      ""
    ).trim();

  if (source) {
    parts.push(
      `<p>来源：${escapeHTML(source)}</p>`
    );
  }

  const remarks =
    Array.isArray(
      outer?.remark
    )
      ? outer.remark
      : [];

  const remarkItems = [];

  for (
    const remark of remarks
  ) {
    if (
      !remark ||
      typeof remark !==
        "object"
    ) {
      continue;
    }

    const title =
      String(
        remark.title ||
        ""
      ).trim();

    const content =
      String(
        remark.content ||
        ""
      ).trim();

    const link =
      String(
        remark.link ||
        remark.url ||
        ""
      ).trim();

    let text = "";

    if (
      link &&
      title
    ) {
      text =
        `<a href="${escapeHTML(link)}">${escapeHTML(title)}</a>`;
    } else if (title) {
      text =
        escapeHTML(title);
    }

    if (content) {
      if (text) {
        text += "：";
      }

      text +=
        escapeHTML(content);
    }

    if (text) {
      remarkItems.push(
        `<li>${text}</li>`
      );
    }
  }

  if (
    remarkItems.length
  ) {
    parts.push(
      `<p><strong>相关信息</strong></p><ul>${remarkItems.join("")}</ul>`
    );
  }

  return parts.join("");
}


function parsePubDate(
  value
) {
  if (!value) {
    return "";
  }

  const match =
    String(value).match(
      /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
    );

  if (!match) {
    return "";
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
  ] = match;

  const utc =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 8,
      Number(minute),
      Number(second)
    );

  return new Date(
    utc
  ).toUTCString();
}


function escapeXML(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&apos;"
    );
}


function escapeHTML(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}
