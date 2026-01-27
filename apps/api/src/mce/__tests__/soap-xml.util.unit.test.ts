import { describe, expect, it } from 'vitest';

import { parseSoapXml } from '../soap-xml.util';

describe('parseSoapXml', () => {
  describe('envelope extraction', () => {
    it('extracts Body from standard SOAP envelope', () => {
      // Arrange
      const xml = '<Envelope><Body><Result>success</Result></Body></Envelope>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Result: 'success' },
      });
    });

    it('extracts Body when present without Envelope wrapper', () => {
      // Arrange
      const xml = '<Body><Result>direct-body</Result></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Result: 'direct-body' },
      });
    });

    it('extracts only Body from envelope with multiple children', () => {
      // Arrange
      const xml =
        '<Envelope><Header><Auth>token</Auth></Header><Body><Data>value</Data></Body></Envelope>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Data: 'value' },
      });
    });

    it('returns full parsed result when Body is missing', () => {
      // Arrange
      const xml = '<Envelope><Header><Auth>token</Auth></Header></Envelope>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Envelope: { Header: { Auth: 'token' } },
      });
    });
  });

  describe('self-closing tags', () => {
    it('parses single self-closing element as empty string', () => {
      // Arrange
      const xml = '<Body><Empty/></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Empty: '' },
      });
    });

    it('parses multiple self-closing siblings as separate empty values', () => {
      // Arrange
      const xml = '<Body><First/><Second/><Third/></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { First: '', Second: '', Third: '' },
      });
    });
  });

  describe('nested elements', () => {
    it('parses simple one-level nesting', () => {
      // Arrange
      const xml = '<Body><Parent><Child>text</Child></Parent></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Parent: { Child: 'text' } },
      });
    });

    it('parses deeply nested structures', () => {
      // Arrange
      const xml = '<Body><A><B><C><D>deep-value</D></C></B></A></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { A: { B: { C: { D: 'deep-value' } } } },
      });
    });

    it('creates array when sibling elements have same name', () => {
      // Arrange
      const xml =
        '<Body><Item>first</Item><Item>second</Item><Item>third</Item></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Item: ['first', 'second', 'third'] },
      });
    });

    it('handles mixed unique and duplicate siblings', () => {
      // Arrange
      const xml =
        '<Body><Name>test</Name><Item>a</Item><Item>b</Item><Status>ok</Status></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Name: 'test', Item: ['a', 'b'], Status: 'ok' },
      });
    });
  });

  describe('entity decoding', () => {
    it('decodes &lt; to less-than sign', () => {
      // Arrange
      const xml = '<Body><Value>a &lt; b</Value></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Value: 'a < b' },
      });
    });

    it('decodes &gt; to greater-than sign', () => {
      // Arrange
      const xml = '<Body><Value>a &gt; b</Value></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Value: 'a > b' },
      });
    });

    it('decodes &amp; to ampersand', () => {
      // Arrange
      const xml = '<Body><Value>Tom &amp; Jerry</Value></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Value: 'Tom & Jerry' },
      });
    });

    it('decodes &quot; to double quote', () => {
      // Arrange
      const xml = '<Body><Value>say &quot;hello&quot;</Value></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Value: 'say "hello"' },
      });
    });

    it('decodes &apos; to single quote', () => {
      // Arrange
      const xml = '<Body><Value>it&apos;s working</Value></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Value: "it's working" },
      });
    });
  });

  describe('namespace stripping', () => {
    it('strips soap namespace prefix from tag names', () => {
      // Arrange
      const xml =
        '<soap:Envelope><soap:Body><soap:Result>data</soap:Result></soap:Body></soap:Envelope>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Result: 'data' },
      });
    });

    it('strips arbitrary namespace prefixes from tag names', () => {
      // Arrange
      const xml = '<ns1:Body><ns2:Element>value</ns2:Element></ns1:Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { Element: 'value' },
      });
    });

    it('preserves tag names that have no namespace prefix', () => {
      // Arrange
      const xml = '<Body><PlainElement>no-namespace</PlainElement></Body>';

      // Act
      const result = parseSoapXml(xml);

      // Assert
      expect(result).toEqual({
        Body: { PlainElement: 'no-namespace' },
      });
    });
  });
});
