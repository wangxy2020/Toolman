import type { CommunityResourcePublishState } from './useCommunityResourcePublishModal'

type FormSlice = Pick<
  CommunityResourcePublishState,
  | 't'
  | 'resourceLabel'
  | 'publishConfig'
  | 'readOnlyMeta'
  | 'title'
  | 'setTitle'
  | 'description'
  | 'setDescription'
  | 'category'
  | 'setCategory'
  | 'license'
  | 'setLicense'
  | 'tags'
  | 'setTags'
  | 'version'
  | 'setVersion'
>

export function CommunityResourcePublishFormFields({ form }: { form: FormSlice }) {
  const {
    t,
    resourceLabel,
    publishConfig,
    readOnlyMeta,
    title,
    setTitle,
    description,
    setDescription,
    category,
    setCategory,
    license,
    setLicense,
    tags,
    setTags,
    version,
    setVersion,
  } = form

  return (
    <>
      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          {t('communityPage.resourcePublish.titleField', { label: resourceLabel })}{' '}
          <span className="tm-community-publish-required">{t('communityPage.publish.required')}</span>
        </span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('communityPage.resourcePublish.titlePlaceholder', { label: resourceLabel })}
          readOnly={readOnlyMeta}
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">{t('communityPage.resourcePublish.descriptionLabel')}</span>
        <textarea
          className="tm-community-publish-textarea"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('communityPage.resourcePublish.descriptionPlaceholder')}
          readOnly={readOnlyMeta}
        />
      </label>

      <div className="tm-community-publish-grid">
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">{t('communityPage.resourcePublish.categoryLabel')}</span>
          <input
            type="text"
            className="tm-community-publish-input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder={publishConfig.categoryPlaceholder}
          />
        </label>
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">{t('communityPage.resourcePublish.tagsLabel')}</span>
          <input
            type="text"
            className="tm-community-publish-input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder={publishConfig.tagsPlaceholder}
          />
        </label>
      </div>

      <div className="tm-community-publish-grid">
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">{t('communityPage.resourcePublish.licenseLabel')}</span>
          <input
            type="text"
            className="tm-community-publish-input tm-community-publish-input--medium"
            value={license}
            onChange={(event) => setLicense(event.target.value)}
            placeholder="MIT"
          />
        </label>
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">{t('communityPage.resourcePublish.versionLabel')}</span>
          <input
            type="text"
            className="tm-community-publish-input tm-community-publish-input--mono"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          />
        </label>
      </div>
    </>
  )
}
