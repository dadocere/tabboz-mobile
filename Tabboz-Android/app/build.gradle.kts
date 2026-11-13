plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
    id("com.google.firebase.crashlytics")
}

val productionAppId = providers.gradleProperty("TABBOZ_ADMOB_APP_ID").orElse("")
val productionInterstitial = providers.gradleProperty("TABBOZ_INTERSTITIAL_ID").orElse("")
val productionRewarded = providers.gradleProperty("TABBOZ_REWARDED_ID").orElse("")
val googleTestAppId = "ca-app-pub-3940256099942544~3347511713"

android {
    namespace = "it.tabboz.simulator"
    compileSdk = 36
    defaultConfig {
        applicationId = "it.tabboz.simulator"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["admobAppId"] = productionAppId.get().ifEmpty { googleTestAppId }
    }
    buildFeatures { buildConfig = true }
    buildTypes {
        debug {
            manifestPlaceholders["admobAppId"] = googleTestAppId
            buildConfigField("String", "INTERSTITIAL_ID", "\"ca-app-pub-3940256099942544/1033173712\"")
            buildConfigField("String", "REWARDED_ID", "\"ca-app-pub-3940256099942544/5224354917\"")
            buildConfigField("boolean", "ADS_CONFIGURED", "true")
        }
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "INTERSTITIAL_ID", "\"${productionInterstitial.get()}\"")
            buildConfigField("String", "REWARDED_ID", "\"${productionRewarded.get()}\"")
            buildConfigField("boolean", "ADS_CONFIGURED", listOf(productionAppId.get(), productionInterstitial.get(), productionRewarded.get()).all { it.startsWith("ca-app-pub-") && !it.contains("3940256099942544") }.toString())
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/gameAssets"))
    testOptions { unitTests.isReturnDefaultValues = true }
}
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

val syncGameAssets by tasks.registering(Sync::class) {
    from(rootProject.file("../Tabboz-iOS/Tabboz/Web"))
    from("src/main/game")
    from(rootProject.file("../Tabboz-iOS/Tabboz/Resources")) {
        include("LICENSE.txt")
        into("licenses")
    }
    from("src/main/notices") { into("licenses") }
    into(layout.buildDirectory.dir("generated/gameAssets"))
    doLast {
        val index = destinationDir.resolve("index.html")
        index.writeText(index.readText().replace("<script src=\"mobile.js\"></script>", "<script src=\"android-bridge.js\"></script>\n  <script src=\"mobile.js\"></script>"))
    }
}
tasks.named("preBuild") { dependsOn(syncGameAssets) }

dependencies {
    implementation("androidx.activity:activity-ktx:1.11.0")
    implementation("androidx.fragment:fragment:1.8.9")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation(platform("com.google.firebase:firebase-bom:35.2.0"))
    implementation("com.google.firebase:firebase-analytics")
    implementation("com.google.firebase:firebase-crashlytics")
    implementation("com.google.firebase:firebase-config")
    implementation("com.google.android.gms:play-services-ads:25.5.0")
    implementation("com.google.android.ump:user-messaging-platform:4.0.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
}
