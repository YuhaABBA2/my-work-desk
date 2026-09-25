plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 서명 키는 GitHub Actions 비밀값에서만 온다 (저장소가 공개라 키를 커밋하지 않는다).
// 없으면 release 는 서명 없이 빌드되고, CI 는 그 경우 APK 를 올리지 않는다.
val keystorePath: String? = System.getenv("HOMEDESK_KEYSTORE")
val keystorePassword: String? = System.getenv("HOMEDESK_KEYSTORE_PASSWORD")

android {
    namespace = "app.homedesk.widget"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.homedesk.widget"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
    }

    signingConfigs {
        if (keystorePath != null && keystorePassword != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = keystorePassword
                storeType = "PKCS12"
                keyAlias = "homedesk"
                keyPassword = keystorePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    testImplementation("junit:junit:4.13.2")
}
