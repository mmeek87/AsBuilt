# Navigation baseline investigation

The staging GitHub Actions run [45481584220](https://github.com/mmeek87/v0-jamaica-payments/actions/runs/45481584220), commit `7db94ba47ad2a275c63d2f9d4a5ed7cb3dc38e3f`, completed with 121 passing tests on 2026-11-24. The job log confirms `stores list opens a store, and the store shows products` passed in desktop Chromium and mobile, approximately two seconds each. This test starts at `/stores`, dismisses cookies, clicks its first store link, checks the destination URL and verifies a product link exists. It does not select Jamaica first.

AsBuilt's bounded comparison starts at `/stores` but uses the previously reviewed Mandeville destination instead of an arbitrary first store. It checks the reviewed bottled-water product link. This is a related comparison, not an exact reproduction: the GitHub log does not identify which store its first-link selector chose. The comparison has no country-cookie forwarding permission and no cart, login or submission actions. No workflow is triggered.

The earlier country-cookie experiment (`885d644a-b77d-42a2-a077-9e899b517ae6`) did not resolve navigation: country selection passed on both viewports, store navigation timed out and subsequent checkpoints were not attempted. The experimental source remains unpublished and is not installed in the original local service. It must not be treated as the general cookie-permission design.

## AsBuilt result

Run `e1938298-3808-4670-9072-ca3889678f81` passed all four observations: Mandeville store heading and exact reviewed URL, then the Bottled water (24) link, on desktop and mobile. Country-cookie forwarding was off. The run recorded 100 blocked requests and one script error per viewport, so this confirms the named navigation and visible product link only. It does not verify full rendering or the product detail page.

This narrows the unresolved issue to differences in the homepage/country-selection sequence and its navigation path; it does not establish a particular root cause. The basic stores-list-to-store path works in AsBuilt.

## Sending-to menu journey

Run `2848d191-ec17-4dda-8442-aec6a3157b45` used the approved Sending to → Jamaica → Manchester → Mandeville Fresh Mart → Bottled water journey, with country-cookie forwarding off. Desktop passed six checkpoints: selected region plus filtered URL, store heading/URL, retained region, product heading/URL, matching seller link and retained region. Mobile passed region selection and store heading/URL, then the region checkpoint was Not verified. Its screenshot explicitly shows “Sending to Choose location”. Later mobile actions were not attempted. There were 125 blocked requests overall, including one same-origin script request, and script errors, so the location reset cannot yet be attributed to an eBarrel defect.

Reusable `menu` actions support unique accessible menu items. Submenu triggers may omit a destination; final choices require an explicit reviewed same-origin URL. Sensitive actions and form-associated controls remain blocked. Button action matching can use contains while retaining unique-target enforcement. These changes are local experimental source, not installed in the original service or published. TypeScript, 32 automated tests and the targeted browser menu-policy test passed.

## Diagnostic rerun

Run `5fd2a8fd-cf0e-46b6-b73b-528643f730eb` used the identical menu plan and permissions and passed all 12 observations, including mobile region persistence through the product page. No same-origin script was blocked this time. Temporary diagnostics showed only the external Vercel feedback script was denied; those diagnostics were removed after the run. Reports now distinguish safe-fetch/validation failures and fetch timeouts from policy/budget denials.

The previous mobile reset is intermittent and unresolved, not a confirmed application defect or a proven fix. The earlier run had one same-origin script failure, but its exact cause was not captured. A successful rerun must not erase that earlier evidence. Blocked fetch requests and script errors remain coverage limitations even in the passing run. Neither the new menu support nor the unpublished cookie experiment has been installed into the original service or pushed.

## Release validation

The eBarrel-specific cookie experiment has been removed from the code and plan. Service 0.3.1 provides generic menu actions and explicit unique action-name matching, with site-specific labels and destinations only in example plans. Network error categories are recorded without raw errors, cookies, request bodies or URL paths.

After removal, run `face2725-237e-46b9-8ac1-516ae3da8238` passed all 12 checkpoints. The regression suite passed 31 tests and 17 browser tests; TypeScript, Vite and compiled cloud startup checks passed. Version 0.3.1 was installed in the original local service with backups. Prior failures remain documented and are not declared fixed by successful repeats.

The final validation used the installed service through its stdio MCP bridge: run `8164fa54-54cf-4697-8ef5-1ab0242e1ddd` passed all 12 checkpoints and the bridge exposed the menu schema at version 0.3.1. Together with `5fd2a8fd-cf0e-46b6-b73b-528643f730eb` and `face2725-237e-46b9-8ac1-516ae3da8238`, this records three consecutive successful menu runs. Blocked requests and script errors persist as explicit limits. The root cause of the preceding mobile reset is still unknown. This validates the local MCP service, not directory acceptance or a hosted public ChatGPT connector.
