---
title: "SKILL.md — Android Studio 国内加速配置"
summary: "为国内环境配置 Android Studio / Gradle 镜像加速"
created: "2026-05-02"
agent_created: true
---

# Android Studio 国内镜像加速配置

## 适用场景
国内网络环境下 Android Studio 更新慢、Gradle Sync 慢、SDK 下载慢。

## 核心操作

### 1. `settings.gradle.kts` — 阿里云 Maven 镜像

```kotlin
pluginManagement {
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
        maven { url = uri("https://www.jitpack.io") }
        google()
        mavenCentral()
    }
}
```

### 2. `gradle-wrapper.properties` — Gradle 发行版下载

```properties
distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-8.10.2-bin.zip
```

### 3. 全局 `~/.gradle/gradle.properties` — 性能优化

```properties
org.gradle.jvmargs=-Xmx4096m -Dfile.encoding=UTF-8 -XX:MaxMetaspaceSize=512m
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configureondemand=true
org.gradle.workers.max=4
android.useAndroidX=true
kotlin.code.style=official
kotlin.daemon.jvmargs=-Xmx2048m
```

### 4. Hosts 文件加速 SDK 下载

在 `C:\Windows\System32\drivers\etc\hosts` 添加：

```
203.208.40.125  dl.google.com
203.208.40.125  dl-ssl.google.com
```

然后 `ipconfig /flushdns` 刷新 DNS。

### 5. Android Studio HTTP Proxy（自动检测）

File → Settings → Appearance & Behavior → System Settings → HTTP Proxy → **Auto-detect proxy settings**

或者手动配置代理（如有梯子）。

### 6. 清除 Gradle 失败缓存

```bash
# Windows
del /s /q %USERPROFILE%\.gradle\wrapper\dists\*.part 2>nul
del /s /q %USERPROFILE%\.gradle\wrapper\dists\*.failed 2>nul
```
