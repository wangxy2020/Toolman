import { describe, expect, it } from 'vitest'
import type { ModelConfig } from '../state/MobileAppContext'
import {
  listMobileCourseModelOptions,
  mobileDefaultCourseModelOptionLabel,
  resolveCourseSendModelConfig,
  resolveSelectedCourseModelLabel,
} from './useClassroomSettingsModal'

const config: ModelConfig = {
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-test',
  model: 'deepseek-v4-flash',
  localModelEnabled: false,
}

describe('course model options', () => {
  it('labels the settings default model and lists suggested models for that provider', () => {
    expect(mobileDefaultCourseModelOptionLabel(config)).toBe(
      '使用默认模型（深度求索 / deepseek-v4-flash）',
    )
    const options = listMobileCourseModelOptions(config)
    expect(options.map((item) => item.modelId)).toEqual(
      expect.arrayContaining(['deepseek:deepseek-v4-flash', 'deepseek:deepseek-v4-pro']),
    )
    expect(resolveSelectedCourseModelLabel('', options, mobileDefaultCourseModelOptionLabel(config))).toBe(
      '跟随默认（深度求索 / deepseek-v4-flash）',
    )
    expect(
      resolveSelectedCourseModelLabel('deepseek:deepseek-v4-pro', options, '使用默认模型'),
    ).toBe('深度求索 / deepseek-v4-pro')
  })

  it('sends with the selected course model', () => {
    const next = resolveCourseSendModelConfig(config, 'deepseek:deepseek-v4-pro')
    expect(next.providerId).toBe('deepseek')
    expect(next.model).toBe('deepseek-v4-pro')
  })
})
