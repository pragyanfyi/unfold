# Changelog

## [0.8.1](https://github.com/pragyanfyi/unfold/compare/v0.8.0...v0.8.1) (2026-11-20)


### Bug Fixes

* **chat:** end a turn with an error when the model goes silent ([#92](https://github.com/pragyanfyi/unfold/issues/92)) ([cf525b6](https://github.com/pragyanfyi/unfold/commit/cf525b69ac3245b1999a42ee25bc138d24727620))
* **chat:** show provider errors as one plain sentence that names the model ([#94](https://github.com/pragyanfyi/unfold/issues/94)) ([35990ab](https://github.com/pragyanfyi/unfold/commit/35990ab958f95892f1273d9516e8201f66bea648))

## [0.8.0](https://github.com/pragyanfyi/unfold/compare/v0.7.0...v0.8.0) (2026-11-20)


### Features

* **ai:** add Google Gemini as a second provider, one key at a time ([#91](https://github.com/pragyanfyi/unfold/issues/91)) ([8fccab0](https://github.com/pragyanfyi/unfold/commit/8fccab0766313a19a2c5ea60e3f281f3b40a6f3f))
* **web:** let the user replace or remove a saved API key ([#89](https://github.com/pragyanfyi/unfold/issues/89)) ([c083c0d](https://github.com/pragyanfyi/unfold/commit/c083c0dd213daab92ae0f62029c343218a51bbde))

## [0.7.0](https://github.com/pragyanfyi/unfold/compare/v0.6.0...v0.7.0) (2026-11-19)


### Features

* **auth:** add the Convex Auth v2 backend with Google sign-in ([#80](https://github.com/pragyanfyi/unfold/issues/80)) ([2cbbf3c](https://github.com/pragyanfyi/unfold/commit/2cbbf3ca147a8d18250805baf0cedb4f46748134))
* **auth:** require sign-in, with onboarding in the composer ([#83](https://github.com/pragyanfyi/unfold/issues/83)) ([6d31298](https://github.com/pragyanfyi/unfold/commit/6d31298f2c5040c792cf9e0e1cfd6f003b8cae97))
* **auth:** sign in and out in the web app, and E2E against Convex ([#82](https://github.com/pragyanfyi/unfold/issues/82)) ([221cb43](https://github.com/pragyanfyi/unfold/commit/221cb432373b4514b9377d96525f89fd8927c7ac))
* **chat:** run the interview in a Convex HTTP action ([#87](https://github.com/pragyanfyi/unfold/issues/87)) ([39706a3](https://github.com/pragyanfyi/unfold/commit/39706a32d84ae26279769c3d7e5899b06c3d5b74))
* **db:** add the turn document and run ownership for the chat move ([#86](https://github.com/pragyanfyi/unfold/issues/86)) ([0fef265](https://github.com/pragyanfyi/unfold/commit/0fef265d0dd19261439d7ab240421fc9be862788))
* **db:** store ideas in Convex and remove IndexedDB ([#84](https://github.com/pragyanfyi/unfold/issues/84)) ([7f0ce88](https://github.com/pragyanfyi/unfold/commit/7f0ce88ee294215011469ac23c2a67a3b697cee2)), closes [#74](https://github.com/pragyanfyi/unfold/issues/74)

## [0.6.0](https://github.com/pragyanfyi/unfold/compare/v0.5.0...v0.6.0) (2026-11-18)


### Features

* **db:** add the Convex backend package, schema and CI check ([#76](https://github.com/pragyanfyi/unfold/issues/76)) ([6be45af](https://github.com/pragyanfyi/unfold/commit/6be45afa13452084e3638274c3606b045bc655bf))

## [0.5.0](https://github.com/pragyanfyi/unfold/compare/v0.4.0...v0.5.0) (2026-11-17)


### Features

* **canvas:** keyboard navigation, focus handling and an axe pass ([#71](https://github.com/pragyanfyi/unfold/issues/71)) ([90551e9](https://github.com/pragyanfyi/unfold/commit/90551e941bee41c0162e8405928e0bed88864fc9))
* **canvas:** link chat turns and tree nodes ([#68](https://github.com/pragyanfyi/unfold/issues/68)) ([be4b85d](https://github.com/pragyanfyi/unfold/commit/be4b85dc7f9401409613dbb9b30e9b46c5e3f471))
* **hotkeys:** add a shortcut registry and the Mod+/ list ([#70](https://github.com/pragyanfyi/unfold/issues/70)) ([4fa2c16](https://github.com/pragyanfyi/unfold/commit/4fa2c16a9a8e5bde514dc5153d2ec33d3c189674))


### Bug Fixes

* **deps:** bump lucide-react from 1.70.0 to 1.72.0 ([#64](https://github.com/pragyanfyi/unfold/issues/64)) ([0596a7d](https://github.com/pragyanfyi/unfold/commit/0596a7d7ee8ddd053543388134ccf8650745e14f))

## [0.4.0](https://github.com/pragyanfyi/unfold/compare/v0.3.0...v0.4.0) (2026-11-16)


### Features

* **canvas:** animate the tree as it grows ([#67](https://github.com/pragyanfyi/unfold/issues/67)) ([5f86135](https://github.com/pragyanfyi/unfold/commit/5f86135abf2d18d82c13bbf15621c9ce164f26fd))
* **canvas:** derive the decision tree from the chat messages ([#50](https://github.com/pragyanfyi/unfold/issues/50)) ([dde44e9](https://github.com/pragyanfyi/unfold/commit/dde44e94f5f8e386fd357ef61040a85c69079172))
* **canvas:** lay out the decision tree ([#57](https://github.com/pragyanfyi/unfold/issues/57)) ([6dc2373](https://github.com/pragyanfyi/unfold/commit/6dc2373b8b1f0e70a49287d21d8447937e30b3d5))
* **canvas:** render the decision tree ([#58](https://github.com/pragyanfyi/unfold/issues/58)) ([e65978a](https://github.com/pragyanfyi/unfold/commit/e65978a03cb23bcd04190277e80ce6670a1cee7d))
* **chat:** reject turns that break the tree rules ([#55](https://github.com/pragyanfyi/unfold/issues/55)) ([c71144d](https://github.com/pragyanfyi/unfold/commit/c71144d28acb8649b6c3d254535147c2e88c8f53))
* **chat:** send the tree outline with every request ([#53](https://github.com/pragyanfyi/unfold/issues/53)) ([0a71ec7](https://github.com/pragyanfyi/unfold/commit/0a71ec749bc4abbc1d6f2da097fb5d4e97678026))

## [0.3.0](https://github.com/pragyanfyi/unfold/compare/v0.2.0...v0.3.0) (2026-11-11)


### Features

* **ai:** add BYOK key entry and chat route ([#41](https://github.com/pragyanfyi/unfold/issues/41)) ([cd7598e](https://github.com/pragyanfyi/unfold/commit/cd7598e9605d811f9d05b929ad96c08b22351266))
* **chat:** interview chat UI ([#43](https://github.com/pragyanfyi/unfold/issues/43)) ([7099523](https://github.com/pragyanfyi/unfold/commit/7099523b0cbadac40bad9ccfa927075c731761b9))
* **db:** save and restore conversations in the browser ([#45](https://github.com/pragyanfyi/unfold/issues/45)) ([bf9e8fc](https://github.com/pragyanfyi/unfold/commit/bf9e8fc4203476d67d62f63482e4c46db7661a51))

## [0.2.0](https://github.com/pragyanfyi/unfold/compare/v0.1.0...v0.2.0) (2026-11-08)


### Features

* **web:** notify when a new version is deployed ([#19](https://github.com/pragyanfyi/unfold/issues/19)) ([d753753](https://github.com/pragyanfyi/unfold/commit/d7537534e6bd66eb5d7f411d776af45c3dfcf6b0))

## 0.1.0 (2026-11-08)


### Features

* **web:** add shadcn/ui, Tailwind and Sonner toaster ([#13](https://github.com/pragyanfyi/unfold/issues/13)) ([8656e33](https://github.com/pragyanfyi/unfold/commit/8656e33207425ad74b1d084ea7f1a148943ee06d))
