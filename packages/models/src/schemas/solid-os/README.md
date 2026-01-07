# SolidOS Schema Files

本目录存放从 SolidOS 项目获取的 RDF Schema/Shape 文件，用于参考和保持与 Solid 生态系统的兼容性。

## 文件列表

### chat-shapes.ttl
- **来源**: https://github.com/SolidOS/chat-pane
- **用途**: 定义 Solid Chat 的数据结构
- **主要类型**:
  - `mee:LongChat` - 聊天频道
  - `flow:message` - 消息
  - `flow:participation` - 参与者

### contacts-shapes.ttl
- **来源**: https://github.com/SolidOS/contacts-pane
- **用途**: 定义联系人数据结构 (基于 vCard)
- **主要类型**:
  - `vcard:AddressBook` - 通讯录
  - `vcard:Individual` - 个人联系人
  - `vcard:Group` - 联系人分组

## 常用命名空间

```turtle
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

# Domain
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix terms: <http://purl.org/dc/terms/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
@prefix sioc: <http://rdfs.org/sioc/ns#> .
@prefix schema: <http://schema.org/> .

# Solid specific
@prefix solid: <http://www.w3.org/ns/solid/terms#> .
@prefix mee: <http://www.w3.org/ns/pim/meeting#> .
@prefix flow: <http://www.w3.org/2005/01/wf/flow#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix ical: <http://www.w3.org/2002/12/cal/ical#> .
```

## 与我们 Schema 的映射

### Chat

| Solid Chat | 我们的字段 | 说明 |
|------------|-----------|------|
| `mee:LongChat` | `chatTable` | 聊天 |
| `dc:title` | `title` | 标题 |
| `dc:author` | - | 创建者 (需添加) |
| `dc:created` | `createdAt` | 创建时间 |
| `flow:participation` | - | 参与者 (需添加) |

### Message

| Solid Chat | 我们的字段 | 说明 |
|------------|-----------|------|
| `flow:message` | `messageTable` | 消息 |
| `terms:created` | `createdAt` | 创建时间 |
| `foaf:maker` | `maker` | 发送者 WebID |
| `sioc:content` | `content` | 内容 |

### Contact

| Solid Contacts | 我们的字段 | 说明 |
|----------------|-----------|------|
| `vcard:Individual` | `contactTable` | 联系人 |
| `vcard:fn` | `name` | 全名 |
| `vcard:hasEmail` | - | 邮箱 |
| `vcard:hasTelephone` | - | 电话 |
| `vcard:url` (type WebId) | `webId` | Solid WebID |

## 相关链接

- [SolidOS GitHub](https://github.com/SolidOS)
- [Solid Project](https://solidproject.org/)
- [vCard Ontology](https://www.w3.org/TR/vcard-rdf/)
- [SIOC Ontology](http://rdfs.org/sioc/spec/)
